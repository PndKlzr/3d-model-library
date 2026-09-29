import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ThumbnailCacheOwner,
  ThumbnailCleanupResult,
  ThumbnailSignature
} from "../../src/shared/types.js";
import { THUMBNAIL_RENDER_VERSION } from "../../src/shared/thumbnailVersion.js";

export { THUMBNAIL_RENDER_VERSION };
const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_CACHE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const TEMPORARY_FILE_MAX_AGE_MS = 60 * 60 * 1000;

const IMAGE_FORMATS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
} as const;

type ThumbnailCacheOptions = {
  cacheDirectory: string;
  maxImageBytes?: number;
  maxCacheBytes?: number;
  maxAgeMs?: number;
};

export type ThumbnailCachePublication = {
  key: string;
  publish: (commit: () => Promise<void>) => Promise<boolean>;
};

export type ThumbnailCache = {
  read: (signature: ThumbnailSignature, owner?: ThumbnailCacheOwner) => Promise<string | null>;
  write: (
    signature: ThumbnailSignature,
    dataUrl: string,
    ownerOrPublication?: ThumbnailCacheOwner | ThumbnailCachePublication,
    publication?: ThumbnailCachePublication
  ) => Promise<void>;
  invalidate: (signature: ThumbnailSignature) => Promise<void>;
  cleanLibrary: (
    libraryId: string,
    currentSignatures: ThumbnailSignature[]
  ) => Promise<ThumbnailCleanupResult>;
  prune: () => Promise<void>;
};

type ThumbnailOwnershipRecord = {
  schemaVersion: 1;
  cacheKey: string;
  libraryId: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
  rendererVersion: number;
  lastAccessedAt: string;
};

export function createThumbnailCache({
  cacheDirectory,
  maxImageBytes = DEFAULT_MAX_IMAGE_BYTES,
  maxCacheBytes = DEFAULT_MAX_CACHE_BYTES,
  maxAgeMs = DEFAULT_MAX_AGE_MS
}: ThumbnailCacheOptions): ThumbnailCache {
  const pendingWrites = new Map<string, Promise<void>>();

  async function ensureDirectory() {
    await mkdir(cacheDirectory, { recursive: true });
  }

  return {
    async read(signature, owner) {
      await ensureDirectory();
      const key = createThumbnailCacheKey(signature, THUMBNAIL_RENDER_VERSION);

      for (const [mime, extension] of Object.entries(IMAGE_FORMATS)) {
        const cachePath = path.join(cacheDirectory, `${key}.${extension}`);

        try {
          const fileStat = await stat(cachePath);

          if (!fileStat.isFile() || fileStat.size > maxImageBytes) {
            continue;
          }

          const bytes = await readFile(cachePath);

          if (!hasImageSignature(bytes, extension)) {
            await unlink(cachePath).catch(() => undefined);
            continue;
          }

          const now = new Date();
          await utimes(cachePath, now, now).catch(() => undefined);
          if (owner) {
            await ensureOwnershipRecord(key, signature, owner).catch(() => undefined);
          }
          return `data:${mime};base64,${bytes.toString("base64")}`;
        } catch {
          // Missing and unreadable cache entries are normal cache misses.
        }
      }

      return null;
    },

    async write(signature, dataUrl, ownerOrPublication, explicitPublication) {
      let owner: ThumbnailCacheOwner | undefined;
      let publication: ThumbnailCachePublication | undefined;
      if (isThumbnailCacheOwner(ownerOrPublication)) {
        owner = ownerOrPublication;
        publication = explicitPublication;
      } else {
        publication = ownerOrPublication;
      }
      if (owner) validateOwner(owner);
      const parsed = parseDataUrl(dataUrl);

      if (!parsed) {
        throw new Error("Unsupported thumbnail image");
      }

      if (parsed.bytes.length > maxImageBytes) {
        throw new Error("Thumbnail image is too large");
      }

      if (!hasImageSignature(parsed.bytes, parsed.extension)) {
        throw new Error("Unsupported thumbnail image");
      }

      await ensureDirectory();
      const key = createThumbnailCacheKey(signature, THUMBNAIL_RENDER_VERSION);
      const pendingKey = publication ? `${key}\0${publication.key}` : key;
      const pendingWrite = pendingWrites.get(pendingKey);
      if (pendingWrite) {
        return pendingWrite;
      }

      const writePromise = writeCacheEntry(
        key,
        parsed.extension,
        parsed.bytes,
        signature,
        owner,
        publication
      ).finally(() => {
        pendingWrites.delete(pendingKey);
      });
      pendingWrites.set(pendingKey, writePromise);
      return writePromise;
    },

    async invalidate(signature) {
      await ensureDirectory();
      const key = createThumbnailCacheKey(signature, THUMBNAIL_RENDER_VERSION);
      const matchingWrites = [...pendingWrites.entries()]
        .filter(([pendingKey]) => pendingKey === key || pendingKey.startsWith(`${key}\0`))
        .map(([, pendingWrite]) => pendingWrite);
      await Promise.allSettled(matchingWrites);
      await Promise.all(
        [...Object.values(IMAGE_FORMATS).map((extension) =>
          unlink(path.join(cacheDirectory, `${key}.${extension}`)).catch(() => undefined)
        ), unlink(sidecarPath(key)).catch(() => undefined)]
      );
    },

    async cleanLibrary(libraryId, currentSignatures) {
      validateLibraryId(libraryId);
      await ensureDirectory();
      await Promise.allSettled([...pendingWrites.values()]);
      const activeKeys = new Set(currentSignatures.map((signature) =>
        createThumbnailCacheKey(signature, THUMBNAIL_RENDER_VERSION)
      ));
      const entries = await readdir(cacheDirectory, { withFileTypes: true });
      let removedFiles = 0;
      let reclaimedBytes = 0;

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".meta.json")) continue;
        const metadataPath = path.join(cacheDirectory, entry.name);
        const key = entry.name.slice(0, -".meta.json".length);
        const record = await readOwnershipRecord(metadataPath, key);
        if (!record) {
          await unlink(metadataPath).catch(() => undefined);
          continue;
        }
        if (record.libraryId !== libraryId || activeKeys.has(record.cacheKey)) continue;

        for (const extension of Object.values(IMAGE_FORMATS)) {
          const imagePath = path.join(cacheDirectory, `${record.cacheKey}.${extension}`);
          try {
            const imageStat = await stat(imagePath);
            if (imageStat.isFile()) {
              await unlink(imagePath);
              removedFiles += 1;
              reclaimedBytes += imageStat.size;
            }
          } catch {
            // A missing image is already clean.
          }
        }
        await unlink(metadataPath).catch(() => undefined);
      }

      return { removedFiles, reclaimedBytes };
    },

    async prune() {
      await ensureDirectory();
      const entries = await readdir(cacheDirectory, { withFileTypes: true });
      const now = Date.now();
      const files: Array<{ path: string; size: number; modifiedAt: number }> = [];

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        const filePath = path.join(cacheDirectory, entry.name);

        try {
          const fileStat = await stat(filePath);

          if (entry.name.endsWith(".tmp")) {
            if (now - fileStat.mtimeMs > TEMPORARY_FILE_MAX_AGE_MS) {
              await unlink(filePath).catch(() => undefined);
            }
            continue;
          }

          if (entry.name.endsWith(".meta.json")) continue;

          const extension = path.extname(entry.name).slice(1).toLowerCase();
          if (!Object.values(IMAGE_FORMATS).includes(extension as "png" | "jpg" | "webp")) {
            continue;
          }

          if (fileStat.size > maxImageBytes) {
            await removeImageAndSidecar(filePath).catch(() => undefined);
            continue;
          }

          const signatureBytes = await readFile(filePath);
          if (!hasImageSignature(signatureBytes, extension)) {
            await removeImageAndSidecar(filePath).catch(() => undefined);
            continue;
          }

          if (now - fileStat.mtimeMs > maxAgeMs) {
            await removeImageAndSidecar(filePath).catch(() => undefined);
            continue;
          }

          files.push({ path: filePath, size: fileStat.size, modifiedAt: fileStat.mtimeMs });
        } catch {
          // Cache pruning is best effort.
        }
      }

      let totalBytes = files.reduce((total, file) => total + file.size, 0);

      for (const file of files.sort((left, right) => left.modifiedAt - right.modifiedAt)) {
        if (totalBytes <= maxCacheBytes) {
          break;
        }

        await removeImageAndSidecar(file.path).catch(() => undefined);
        totalBytes -= file.size;
      }
    }
  };

  async function writeCacheEntry(
    key: string,
    extension: string,
    bytes: Buffer,
    signature: ThumbnailSignature,
    owner?: ThumbnailCacheOwner,
    publication?: ThumbnailCachePublication
  ) {
    const destinationPath = path.join(cacheDirectory, `${key}.${extension}`);
    const temporaryPath = path.join(cacheDirectory, `${key}-${process.pid}-${randomUUID()}.tmp`);
    await writeFile(temporaryPath, bytes, { flag: "wx" });

    try {
      if (publication) {
        await publication.publish(async () => {
          await rename(temporaryPath, destinationPath);
          if (owner) await writeOwnershipRecord(key, signature, owner);
        });
      } else {
        await rename(temporaryPath, destinationPath);
        if (owner) await writeOwnershipRecord(key, signature, owner);
      }
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  function sidecarPath(key: string) {
    return path.join(cacheDirectory, `${key}.meta.json`);
  }

  async function ensureOwnershipRecord(
    key: string,
    signature: ThumbnailSignature,
    owner: ThumbnailCacheOwner
  ) {
    validateOwner(owner);
    const existing = await readOwnershipRecord(sidecarPath(key), key);
    if (existing && existing.libraryId === owner.libraryId && existing.relativePath === owner.relativePath) {
      const now = new Date();
      await utimes(sidecarPath(key), now, now).catch(() => undefined);
      return;
    }
    await writeOwnershipRecord(key, signature, owner);
  }

  async function writeOwnershipRecord(
    key: string,
    signature: ThumbnailSignature,
    owner: ThumbnailCacheOwner
  ) {
    const record: ThumbnailOwnershipRecord = {
      schemaVersion: 1,
      cacheKey: key,
      libraryId: owner.libraryId,
      relativePath: normalizeRelativePath(owner.relativePath),
      sizeBytes: signature.sizeBytes,
      modifiedAt: signature.modifiedAt,
      rendererVersion: THUMBNAIL_RENDER_VERSION,
      lastAccessedAt: new Date().toISOString()
    };
    const destination = sidecarPath(key);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(record)}\n`, { flag: "wx" });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async function removeImageAndSidecar(imagePath: string) {
    const key = path.basename(imagePath, path.extname(imagePath));
    await unlink(imagePath).catch(() => undefined);
    await unlink(sidecarPath(key)).catch(() => undefined);
  }
}

export function createThumbnailCacheKey(
  signature: ThumbnailSignature,
  rendererVersion = THUMBNAIL_RENDER_VERSION
): string {
  const normalizedPath = path.resolve(signature.absolutePath).replaceAll("\\", "/").toLowerCase();
  return createHash("sha256")
    .update(`${rendererVersion}\0${normalizedPath}\0${signature.sizeBytes}\0${signature.modifiedAt}`)
    .digest("hex");
}

function parseDataUrl(dataUrl: string): { bytes: Buffer; extension: string } | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl);

  if (!match) {
    return null;
  }

  return {
    extension: IMAGE_FORMATS[match[1] as keyof typeof IMAGE_FORMATS],
    bytes: Buffer.from(match[2], "base64")
  };
}

function hasImageSignature(bytes: Buffer, extension: string): boolean {
  if (extension === "png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }

  if (extension === "jpg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

function isThumbnailCacheOwner(
  value: ThumbnailCacheOwner | ThumbnailCachePublication | undefined
): value is ThumbnailCacheOwner {
  return Boolean(value && "libraryId" in value && "relativePath" in value);
}

function validateOwner(owner: ThumbnailCacheOwner) {
  validateLibraryId(owner.libraryId);
  normalizeRelativePath(owner.relativePath);
}

function validateLibraryId(libraryId: string) {
  if (typeof libraryId !== "string" || !libraryId || libraryId.length > 120 || libraryId.includes("\0")) {
    throw new Error("Invalid thumbnail cache library identity");
  }
}

function normalizeRelativePath(relativePath: string): string {
  if (typeof relativePath !== "string" || !relativePath || relativePath.length > 1024 || relativePath.includes("\0")) {
    throw new Error("Invalid thumbnail cache relative path");
  }
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    throw new Error("Invalid thumbnail cache relative path");
  }
  const parts = relativePath.split(/[\\/]+/);
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid thumbnail cache relative path");
  }
  return parts.join("/");
}

async function readOwnershipRecord(
  metadataPath: string,
  expectedKey: string
): Promise<ThumbnailOwnershipRecord | null> {
  try {
    const metadataStat = await stat(metadataPath);
    if (!metadataStat.isFile() || metadataStat.size > 8 * 1024) return null;
    const value: unknown = JSON.parse(await readFile(metadataPath, "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const record = value as Partial<ThumbnailOwnershipRecord>;
    if (
      record.schemaVersion !== 1 ||
      record.cacheKey !== expectedKey ||
      !/^[a-f0-9]{64}$/.test(record.cacheKey) ||
      typeof record.sizeBytes !== "number" ||
      !Number.isFinite(record.sizeBytes) ||
      record.sizeBytes < 0 ||
      typeof record.modifiedAt !== "string" ||
      record.modifiedAt.length > 64 ||
      Number.isNaN(Date.parse(record.modifiedAt)) ||
      record.rendererVersion !== THUMBNAIL_RENDER_VERSION ||
      typeof record.lastAccessedAt !== "string" ||
      record.lastAccessedAt.length > 64 ||
      Number.isNaN(Date.parse(record.lastAccessedAt))
    ) return null;
    validateOwner({ libraryId: record.libraryId!, relativePath: record.relativePath! });
    return record as ThumbnailOwnershipRecord;
  } catch {
    return null;
  }
}
