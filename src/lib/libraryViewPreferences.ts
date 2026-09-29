import {
  SUPPORTED_FILE_EXTENSIONS,
  type SupportedFileExtension
} from "../shared/fileCapabilities";

export type LibraryViewPreferencesV1 = {
  version: 1;
  visibleExtensions: SupportedFileExtension[];
  excludedFolders: string[];
};

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_PREFIX = "model-library:view-preferences:";

export function loadLibraryViewPreferences(
  storage: PreferenceStorage,
  libraryId: string
): LibraryViewPreferencesV1 {
  try {
    return normalizePreferences(JSON.parse(storage.getItem(storageKey(libraryId)) ?? "null"));
  } catch {
    return defaultPreferences();
  }
}

export function saveLibraryViewPreferences(
  storage: PreferenceStorage,
  libraryId: string,
  value: LibraryViewPreferencesV1
): void {
  storage.setItem(storageKey(libraryId), JSON.stringify(normalizePreferences(value)));
}

function normalizePreferences(value: unknown): LibraryViewPreferencesV1 {
  if (!isRecord(value) || value.version !== 1) return defaultPreferences();

  const supportedExtensions = new Set<string>(SUPPORTED_FILE_EXTENSIONS);
  const visibleExtensions = Array.isArray(value.visibleExtensions)
    ? unique(value.visibleExtensions.filter(
      (extension): extension is SupportedFileExtension =>
        typeof extension === "string" && supportedExtensions.has(extension)
    ))
    : [...SUPPORTED_FILE_EXTENSIONS];
  const excludedFolders = Array.isArray(value.excludedFolders)
    ? unique(value.excludedFolders.flatMap(normalizeExcludedFolder))
    : [];

  return { version: 1, visibleExtensions, excludedFolders };
}

function normalizeExcludedFolder(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) return [];

  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return [];
  return [segments.join("/")];
}

function defaultPreferences(): LibraryViewPreferencesV1 {
  return {
    version: 1,
    visibleExtensions: [...SUPPORTED_FILE_EXTENSIONS],
    excludedFolders: []
  };
}

function storageKey(libraryId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(libraryId)}`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
