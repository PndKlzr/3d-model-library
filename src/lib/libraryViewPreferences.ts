import {
  SUPPORTED_FILE_EXTENSIONS,
  type SupportedFileExtension
} from "../shared/fileCapabilities";
import type {
  ModelSortMode,
  NotesFilter,
  TagMatchMode
} from "./folderFilters";

export type LibraryViewPreferencesV2 = {
  version: 2;
  visibleExtensions: SupportedFileExtension[];
  excludedFolders: string[];
  sortMode: ModelSortMode;
  onlyFavorites: boolean;
  notesFilter: NotesFilter;
  tagMatchMode: TagMatchMode;
  selectedTags: string[];
};

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_PREFIX = "model-library:view-preferences:";

export function loadLibraryViewPreferences(
  storage: PreferenceStorage,
  libraryId: string
): LibraryViewPreferencesV2 {
  try {
    return normalizePreferences(JSON.parse(storage.getItem(storageKey(libraryId)) ?? "null"));
  } catch {
    return defaultPreferences();
  }
}

export function saveLibraryViewPreferences(
  storage: PreferenceStorage,
  libraryId: string,
  value: LibraryViewPreferencesV2
): void {
  storage.setItem(storageKey(libraryId), JSON.stringify(normalizePreferences(value)));
}

function normalizePreferences(value: unknown): LibraryViewPreferencesV2 {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) {
    return defaultPreferences();
  }

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

  if (value.version === 1) {
    return { ...defaultPreferences(), visibleExtensions, excludedFolders };
  }

  return {
    version: 2,
    visibleExtensions,
    excludedFolders,
    sortMode: isModelSortMode(value.sortMode) ? value.sortMode : "name",
    onlyFavorites: typeof value.onlyFavorites === "boolean" ? value.onlyFavorites : false,
    notesFilter: isNotesFilter(value.notesFilter) ? value.notesFilter : "all",
    tagMatchMode: isTagMatchMode(value.tagMatchMode) ? value.tagMatchMode : "all",
    selectedTags: Array.isArray(value.selectedTags)
      ? unique(value.selectedTags.flatMap(normalizeTag))
      : []
  };
}

function normalizeExcludedFolder(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) return [];

  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return [];
  return [segments.join("/")];
}

export function defaultLibraryViewPreferences(): LibraryViewPreferencesV2 {
  return {
    version: 2,
    visibleExtensions: [...SUPPORTED_FILE_EXTENSIONS],
    excludedFolders: [],
    sortMode: "name",
    onlyFavorites: false,
    notesFilter: "all",
    tagMatchMode: "all",
    selectedTags: []
  };
}

function defaultPreferences(): LibraryViewPreferencesV2 {
  return defaultLibraryViewPreferences();
}

function storageKey(libraryId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(libraryId)}`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizeTag(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const normalized = value.trim();
  return normalized ? [normalized] : [];
}

function isModelSortMode(value: unknown): value is ModelSortMode {
  return value === "name" || value === "modified" || value === "size";
}

function isNotesFilter(value: unknown): value is NotesFilter {
  return value === "all" || value === "with-notes" || value === "without-notes";
}

function isTagMatchMode(value: unknown): value is TagMatchMode {
  return value === "all" || value === "any" || value === "exclude";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
