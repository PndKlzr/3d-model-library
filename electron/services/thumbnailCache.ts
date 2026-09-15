import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ThumbnailSignature } from "../../src/shared/types.js";
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
  read: (signature: ThumbnailSignature) => Promise<string | null>;
  write: (
    signature: ThumbnailSignature,
    dataUrl: string,
    publication?: ThumbnailCachePublication
  ) => Promise<void>;
  prune: () => Promise<void>;
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
    async read(signature) {
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
          return `data:${mime};base64,${bytes.toString("base64")}`;
        } catch {
          // Missing and unreadable cache entries are normal cache misses.
        }
      }

      return null;
    },

    async write(signature, dataUrl, publication) {
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
        publication
      ).finally(() => {
        pendingWrites.delete(pendingKey);
      });
      pendingWrites.set(pendingKey, writePromise);
      return writePromise;
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

          if (now - fileStat.mtimeMs > maxAgeMs) {
            await unlink(filePath).catch(() => undefined);
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

        await unlink(file.path).catch(() => undefined);
        totalBytes -= file.size;
      }
    }
  };

  async function writeCacheEntry(
    key: string,
    extension: string,
    bytes: Buffer,
    publication?: ThumbnailCachePublication
  ) {
    const destinationPath = path.join(cacheDirectory, `${key}.${extension}`);
    const temporaryPath = path.join(cacheDirectory, `${key}-${process.pid}-${randomUUID()}.tmp`);
    await writeFile(temporaryPath, bytes, { flag: "wx" });

    try {
      if (publication) {
        await publication.publish(() => rename(temporaryPath, destinationPath));
      } else {
        await rename(temporaryPath, destinationPath);
      }
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
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
