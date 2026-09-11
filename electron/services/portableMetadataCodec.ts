import path from "node:path";
import type { LibraryMetadata, ModelUserMetadata } from "../../src/shared/types.js";
import { normalizeLibraryMetadata } from "./libraryMetadataStore.js";

export const PORTABLE_METADATA_DIRECTORY = ".3d-model-library";
export const PORTABLE_METADATA_FILENAME = "3D_LIBRARY_DATA_DO_NOT_DELETE.json";
export const MAX_PORTABLE_METADATA_BYTES = 8 * 1024 * 1024;
export const PORTABLE_METADATA_SCHEMA_VERSION = 1;

const MAX_LIBRARY_ID_LENGTH = 120;
const MAX_MODEL_PATH_LENGTH = 1024;
const MAX_TAG_LENGTH = 80;
const MAX_NOTES_LENGTH = 20_000;
const MAX_SLICER_ID_LENGTH = 120;
const HISTORY_LIMIT = 100;

export type PortableLibraryManifestV1 = {
  schemaVersion: 1;
  libraryId: string;
  updatedAt: string;
  tagCatalog: string[];
  models: Record<string, ModelUserMetadata>;
  slicerHistory: Array<{
    relativePath: string;
    slicerId: string;
    openedAt: string;
  }>;
};

export function encodePortableMetadata(
  rootPath: string,
  libraryId: string,
  metadata: LibraryMetadata,
  updatedAt = new Date().toISOString()
): PortableLibraryManifestV1 {
  const normalizedRoot = path.resolve(rootPath);
  assertBoundedString(libraryId, "library id", MAX_LIBRARY_ID_LENGTH);
  assertTimestamp(updatedAt, "updated timestamp");
  validateMetadataStrings(metadata);

  const normalizedMetadata = normalizeLibraryMetadata(metadata);
  const models = Object.fromEntries(
    Object.entries(normalizedMetadata.models).map(([modelPath, modelMetadata]) => [
      toPortableRelativePath(normalizedRoot, modelPath),
      modelMetadata
    ])
  );
  const slicerHistory = normalizedMetadata.slicerHistory.map((entry) => {
    assertBoundedString(entry.slicerId, "slicer id", MAX_SLICER_ID_LENGTH);
    assertTimestamp(entry.openedAt, "slicer history timestamp");

    return {
      relativePath: toPortableRelativePath(normalizedRoot, entry.modelPath),
      slicerId: entry.slicerId,
      openedAt: entry.openedAt
    };
  });

  return {
    schemaVersion: PORTABLE_METADATA_SCHEMA_VERSION,
    libraryId,
    updatedAt,
    tagCatalog: normalizedMetadata.tagCatalog,
    models,
    slicerHistory
  };
}

export function decodePortableMetadata(
  rootPath: string,
  value: unknown
): { libraryId: string; updatedAt: string; metadata: LibraryMetadata } {
  const manifest = requireRecord(value, "metadata manifest");

  if (manifest.schemaVersion !== PORTABLE_METADATA_SCHEMA_VERSION) {
    throw new Error("Unsupported portable metadata version");
  }

  const libraryId = requireBoundedString(
    manifest.libraryId,
    "library id",
    MAX_LIBRARY_ID_LENGTH
  );
  const updatedAt = requireTimestamp(manifest.updatedAt, "updated timestamp");
  const tagCatalog = readTags(manifest.tagCatalog, "tag catalog");
  const portableModels = requireRecord(manifest.models, "models");
  const models: LibraryMetadata["models"] = {};

  for (const [relativePath, rawMetadata] of Object.entries(portableModels)) {
    const absolutePath = fromPortableRelativePath(rootPath, relativePath);
    const modelMetadata = requireRecord(rawMetadata, `model metadata for ${relativePath}`);
    const notes = modelMetadata.notes === undefined ? "" : requireString(modelMetadata.notes, "notes");

    if (notes.length > MAX_NOTES_LENGTH) {
      throw new Error("Model notes exceed the portable metadata limit");
    }

    models[absolutePath] = {
      favorite: Boolean(modelMetadata.favorite),
      tags: readTags(modelMetadata.tags, "model tags"),
      notes
    };
  }

  const historyValue = manifest.slicerHistory ?? [];

  if (!Array.isArray(historyValue)) {
    throw new Error("Slicer history must be an array");
  }

  const slicerHistory = historyValue.slice(0, HISTORY_LIMIT).map((rawEntry) => {
    const entry = requireRecord(rawEntry, "slicer history entry");
    return {
      modelPath: fromPortableRelativePath(
        rootPath,
        requireBoundedString(entry.relativePath, "relative model path", MAX_MODEL_PATH_LENGTH)
      ),
      slicerId: requireBoundedString(entry.slicerId, "slicer id", MAX_SLICER_ID_LENGTH),
      openedAt: requireTimestamp(entry.openedAt, "slicer history timestamp")
    };
  });

  return {
    libraryId,
    updatedAt,
    metadata: normalizeLibraryMetadata({ models, tagCatalog, slicerHistory })
  };
}

export function isInternalLibraryPath(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(candidatePath));

  if (!relativePath || isOutsideRelativePath(relativePath)) {
    return false;
  }

  return relativePath.split(path.sep)[0].toLowerCase() === PORTABLE_METADATA_DIRECTORY;
}

export function toPortableRelativePath(rootPath: string, absolutePath: string): string {
  if (typeof absolutePath !== "string" || absolutePath.includes("\0")) {
    throw new Error("Model path must be a valid library path");
  }

  const resolvedPath = path.resolve(absolutePath);
  const relativePath = path.relative(rootPath, resolvedPath);

  if (!relativePath || isOutsideRelativePath(relativePath)) {
    throw new Error("Model path must be inside the library");
  }

  const portablePath = relativePath.split(path.sep).join("/");
  assertBoundedString(portablePath, "relative model path", MAX_MODEL_PATH_LENGTH);
  return portablePath;
}

export function fromPortableRelativePath(rootPath: string, relativePath: string): string {
  assertBoundedString(relativePath, "relative model path", MAX_MODEL_PATH_LENGTH);

  if (
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath) ||
    /^[a-zA-Z]:[\\/]/.test(relativePath) ||
    relativePath.startsWith("/") ||
    relativePath.startsWith("\\")
  ) {
    throw new Error("Portable model path must be relative to the library");
  }

  const segments = relativePath.split(/[\\/]+/);

  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Portable model path cannot escape the library");
  }

  const normalizedRoot = path.resolve(rootPath);
  const absolutePath = path.resolve(normalizedRoot, ...segments);
  const verification = path.relative(normalizedRoot, absolutePath);

  if (!verification || isOutsideRelativePath(verification)) {
    throw new Error("Portable model path cannot escape the library");
  }

  return absolutePath;
}

function isOutsideRelativePath(relativePath: string): boolean {
  return relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath);
}

function validateMetadataStrings(metadata: LibraryMetadata) {
  for (const tag of metadata.tagCatalog ?? []) {
    assertBoundedString(tag, "tag", MAX_TAG_LENGTH);
  }

  for (const [modelPath, modelMetadata] of Object.entries(metadata.models ?? {})) {
    assertBoundedString(modelPath, "model path", MAX_MODEL_PATH_LENGTH * 4);
    assertBoundedOptionalString(modelMetadata.notes ?? "", "notes", MAX_NOTES_LENGTH);
    for (const tag of modelMetadata.tags ?? []) {
      assertBoundedString(tag, "tag", MAX_TAG_LENGTH);
    }
  }
}

function readTags(value: unknown, label: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  return value.map((tag) => requireBoundedString(tag, "tag", MAX_TAG_LENGTH));
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  return value;
}

function requireBoundedString(value: unknown, label: string, maximumLength: number): string {
  const text = requireString(value, label);
  assertBoundedString(text, label, maximumLength);
  return text;
}

function assertBoundedString(value: string, label: string, maximumLength: number) {
  if (!value || value.includes("\0") || value.length > maximumLength) {
    throw new Error(`${label} exceeds the portable metadata limit`);
  }
}

function assertBoundedOptionalString(value: string, label: string, maximumLength: number) {
  if (value.includes("\0") || value.length > maximumLength) {
    throw new Error(`${label} exceeds the portable metadata limit`);
  }
}

function requireTimestamp(value: unknown, label: string): string {
  const timestamp = requireBoundedString(value, label, 64);
  assertTimestamp(timestamp, label);
  return timestamp;
}

function assertTimestamp(value: string, label: string) {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} is invalid`);
  }
}
