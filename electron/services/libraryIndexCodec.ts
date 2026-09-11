import path from "node:path";
import {
  SUPPORTED_FILE_EXTENSIONS,
  type SupportedFileExtension
} from "../../src/shared/fileCapabilities.js";
import type { LibraryScanResult, ModelFile } from "../../src/shared/types.js";
import {
  fromPortableRelativePath,
  toPortableRelativePath
} from "./portableMetadataCodec.js";

export const LIBRARY_INDEX_SCHEMA_VERSION = 1;
export const MAX_LIBRARY_INDEX_FILES = 250_000;

const MAX_LIBRARY_ID_LENGTH = 120;
const MAX_TIMESTAMP_LENGTH = 64;
const SUPPORTED_EXTENSIONS = new Set<string>(SUPPORTED_FILE_EXTENSIONS);

export type PortableLibraryIndexV1 = {
  schemaVersion: 1;
  libraryId: string;
  savedAt: string;
  folders: string[];
  files: Array<{
    relativePath: string;
    extension: SupportedFileExtension;
    sizeBytes: number;
    modifiedAt: string;
  }>;
};

export function encodeLibraryIndex(
  rootPath: string,
  result: LibraryScanResult,
  libraryId: string
): PortableLibraryIndexV1 {
  if (result.models.length > MAX_LIBRARY_INDEX_FILES) {
    throw new Error("Library index exceeds the 250,000 file limit");
  }

  requireBoundedString(libraryId, "library id", MAX_LIBRARY_ID_LENGTH);
  const normalizedRoot = path.resolve(rootPath);
  const folders = [...new Set(result.folders.map((folder) =>
    toPortableRelativePath(normalizedRoot, path.resolve(normalizedRoot, folder))
  ))].sort();
  const files = result.models.map((model) => ({
    relativePath: toPortableRelativePath(normalizedRoot, model.absolutePath),
    extension: requireSupportedExtension(model.extension),
    sizeBytes: requireSize(model.sizeBytes),
    modifiedAt: requireTimestamp(model.modifiedAt, "modified timestamp")
  }));

  return {
    schemaVersion: LIBRARY_INDEX_SCHEMA_VERSION,
    libraryId,
    savedAt: new Date().toISOString(),
    folders,
    files
  };
}

export function decodeLibraryIndex(
  rootPath: string,
  value: unknown
): { libraryId: string; result: LibraryScanResult } {
  const manifest = requireRecord(value, "library index manifest");

  if (manifest.schemaVersion !== LIBRARY_INDEX_SCHEMA_VERSION) {
    throw new Error("Unsupported library index schema");
  }

  const libraryId = requireBoundedString(manifest.libraryId, "library id", MAX_LIBRARY_ID_LENGTH);
  requireTimestamp(manifest.savedAt, "saved timestamp");

  if (!Array.isArray(manifest.folders)) {
    throw new Error("Library index folders must be an array");
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error("Library index files must be an array");
  }
  if (manifest.files.length > MAX_LIBRARY_INDEX_FILES) {
    throw new Error("Library index exceeds the 250,000 file limit");
  }

  const normalizedRoot = path.resolve(rootPath);
  const folders = [...new Set(manifest.folders.map((folder) => {
    const relativeFolder = requireBoundedString(folder, "relative folder path", 1024);
    const absoluteFolder = fromPortableRelativePath(normalizedRoot, relativeFolder);
    return toPortableRelativePath(normalizedRoot, absoluteFolder);
  }))].sort();
  const models = manifest.files.map((file) => decodeFile(normalizedRoot, file));

  return {
    libraryId,
    result: { rootPath: normalizedRoot, folders, models, errors: [] }
  };
}

function decodeFile(rootPath: string, value: unknown): ModelFile {
  const file = requireRecord(value, "library index file");
  const relativePath = requireBoundedString(file.relativePath, "relative file path", 1024);
  const absolutePath = fromPortableRelativePath(rootPath, relativePath);
  const extension = requireSupportedExtension(file.extension);

  if (path.extname(absolutePath).toLowerCase() !== extension) {
    throw new Error("Library index file extension does not match its relative path");
  }

  const relativeFolder = path.dirname(relativePath).replaceAll("\\", "/");
  return {
    id: absolutePath,
    name: path.basename(absolutePath),
    extension,
    absolutePath,
    relativeFolder: relativeFolder === "." ? "" : relativeFolder,
    sizeBytes: requireSize(file.sizeBytes),
    modifiedAt: requireTimestamp(file.modifiedAt, "modified timestamp"),
    dimensionsMm: null,
    objectCount: null,
    previewError: null
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireBoundedString(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string" || !value || value.includes("\0") || value.length > maximumLength) {
    throw new Error(`${label} exceeds the library index limit`);
  }
  return value;
}

function requireTimestamp(value: unknown, label: string): string {
  const timestamp = requireBoundedString(value, label, MAX_TIMESTAMP_LENGTH);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`${label} is not a valid date`);
  }
  return timestamp;
}

function requireSupportedExtension(value: unknown): SupportedFileExtension {
  if (typeof value !== "string" || !SUPPORTED_EXTENSIONS.has(value)) {
    throw new Error("Library index contains an unsupported file extension");
  }
  return value as SupportedFileExtension;
}

function requireSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Library index file size is invalid");
  }
  return value;
}
