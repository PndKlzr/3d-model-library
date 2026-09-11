import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { LibraryScanResult } from "../../src/shared/types.js";
import {
  decodeLibraryIndex,
  encodeLibraryIndex,
  type PortableLibraryIndexV1
} from "./libraryIndexCodec.js";
import { PORTABLE_METADATA_DIRECTORY } from "./portableMetadataCodec.js";
import { hideDirectoryOnWindows } from "./portableMetadataRepository.js";

export const LIBRARY_INDEX_FILENAME = "LIBRARY_INDEX_DO_NOT_DELETE.json";
export const MAX_LIBRARY_INDEX_BYTES = 32 * 1024 * 1024;

export type LibraryIndexStore = {
  load: (rootPath: string, libraryId?: string) => Promise<LibraryScanResult | null>;
  save: (rootPath: string, libraryId: string, result: LibraryScanResult) => Promise<void>;
};

type LibraryIndexStoreOptions = {
  hideDirectory?: (directoryPath: string) => Promise<void>;
  maximumBytes?: number;
  openFile?: (filePath: string) => Promise<ReadIndexHandle>;
  replaceFile?: (sourcePath: string, destinationPath: string) => Promise<void>;
};

type ReadIndexHandle = {
  stat: () => Promise<{ isFile: () => boolean; size: number }>;
  read: (
    buffer: Buffer,
    offset: number,
    length: number,
    position: number
  ) => Promise<{ bytesRead: number }>;
  close: () => Promise<void>;
};

export function createLibraryIndexStore({
  hideDirectory = hideDirectoryOnWindows,
  maximumBytes = MAX_LIBRARY_INDEX_BYTES,
  openFile = (filePath) => open(filePath, "r"),
  replaceFile = rename
}: LibraryIndexStoreOptions = {}): LibraryIndexStore {
  async function requireRoot(rootPath: string): Promise<string> {
    const normalizedRoot = path.resolve(rootPath);
    const rootStat = await stat(normalizedRoot);
    if (!rootStat.isDirectory()) {
      throw new Error("Library root is not a directory");
    }
    return normalizedRoot;
  }

  async function load(rootPath: string, libraryId?: string): Promise<LibraryScanResult | null> {
    const normalizedRoot = await requireRoot(rootPath);
    const indexPath = getIndexPath(normalizedRoot);
    let handle: ReadIndexHandle;

    try {
      handle = await openFile(indexPath);
    } catch (error) {
      if (isMissingError(error)) return null;
      throw error;
    }

    let serialized: string | null;
    try {
      const indexStat = await handle.stat();
      if (!indexStat.isFile() || indexStat.size > maximumBytes) return null;
      serialized = await readBoundedUtf8(handle, maximumBytes);
    } finally {
      await handle.close();
    }

    if (serialized === null) return null;

    try {
      const parsed: unknown = JSON.parse(serialized);
      const decoded = decodeLibraryIndex(normalizedRoot, parsed);
      return libraryId === undefined || decoded.libraryId === libraryId ? decoded.result : null;
    } catch {
      return null;
    }
  }

  async function save(rootPath: string, libraryId: string, result: LibraryScanResult): Promise<void> {
    const normalizedRoot = await requireRoot(rootPath);
    const directoryPath = path.join(normalizedRoot, PORTABLE_METADATA_DIRECTORY);
    const indexPath = getIndexPath(normalizedRoot);
    const manifest = encodeLibraryIndex(normalizedRoot, result, libraryId);
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

    if (Buffer.byteLength(serialized, "utf8") > maximumBytes) {
      throw new Error("Library index exceeds the 32 MiB limit");
    }

    await mkdir(directoryPath, { recursive: true });
    try {
      await hideDirectory(directoryPath);
    } catch (error) {
      console.warn("[library-index] failed to hide the internal directory", error);
    }

    const temporaryPath = path.join(
      directoryPath,
      `${LIBRARY_INDEX_FILENAME}.${randomUUID()}.tmp`
    );
    let temporaryHandle: Awaited<ReturnType<typeof open>> | null = null;

    try {
      temporaryHandle = await open(temporaryPath, "wx");
      await temporaryHandle.writeFile(serialized, "utf8");
      await temporaryHandle.sync();
      await temporaryHandle.close();
      temporaryHandle = null;
      await replaceFile(temporaryPath, indexPath);
    } finally {
      await temporaryHandle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  return { load, save };
}

export function createInMemoryLibraryIndexStore(): LibraryIndexStore {
  const manifests = new Map<string, PortableLibraryIndexV1>();

  return {
    async load(rootPath, libraryId) {
      const manifest = manifests.get(normalizeRootKey(rootPath));
      if (!manifest) return null;
      const decoded = decodeLibraryIndex(rootPath, structuredClone(manifest));
      return libraryId === undefined || decoded.libraryId === libraryId ? decoded.result : null;
    },
    async save(rootPath, libraryId, result) {
      manifests.set(
        normalizeRootKey(rootPath),
        structuredClone(encodeLibraryIndex(rootPath, result, libraryId))
      );
    }
  };
}

function getIndexPath(rootPath: string): string {
  return path.join(rootPath, PORTABLE_METADATA_DIRECTORY, LIBRARY_INDEX_FILENAME);
}

function normalizeRootKey(rootPath: string): string {
  return path.resolve(rootPath).replaceAll("\\", "/").toLowerCase();
}

function isMissingError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function readBoundedUtf8(
  handle: ReadIndexHandle,
  maximumBytes: number
): Promise<string | null> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (totalBytes <= maximumBytes) {
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maximumBytes + 1 - totalBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, totalBytes);
    if (bytesRead === 0) break;
    chunks.push(buffer.subarray(0, bytesRead));
    totalBytes += bytesRead;
  }

  return totalBytes > maximumBytes
    ? null
    : Buffer.concat(chunks, totalBytes).toString("utf8");
}
