import type { ModelFile, ModelUserMetadata, SlicerHistoryEntry } from "../shared/types";
import type { SupportedFileExtension } from "../shared/fileCapabilities";

export const ALL_FOLDERS_ID = "__all__";

export type ModelSortMode = "name" | "modified" | "size";
export type UsageFilter = "all" | "recent" | "never";
export type NotesFilter = "all" | "with-notes" | "without-notes";
export type TagMatchMode = "all" | "any" | "exclude";

export type ModelFilterOptions = {
  visibleExtensions?: ReadonlySet<SupportedFileExtension>;
  excludedFolders?: readonly string[];
  sort?: ModelSortMode;
  onlySelected?: boolean;
  selectedIds?: Set<string>;
  onlyDuplicates?: boolean;
  duplicateIds?: Set<string>;
  onlyFavorites?: boolean;
  selectedTags?: string[];
  usageFilter?: UsageFilter;
  notesFilter?: NotesFilter;
  tagMatchMode?: TagMatchMode;
  slicerHistory?: SlicerHistoryEntry[];
  now?: number;
  metadataByPath?: Record<string, ModelUserMetadata>;
};

export function filterModels(
  models: ModelFile[],
  selectedFolder: string,
  includeSubfolders: boolean,
  searchQuery: string,
  options: ModelFilterOptions = {}
): ModelFile[] {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleExtensions = options.visibleExtensions;
  const excludedFolders = options.excludedFolders ?? [];
  const sortMode = options.sort ?? "name";
  const selectedTags = normalizeTags(options.selectedTags ?? []);
  const metadataByPath = normalizeMetadataPathMap(options.metadataByPath ?? {});
  const usageFilter = options.usageFilter ?? "all";
  const notesFilter = options.notesFilter ?? "all";
  const tagMatchMode = options.tagMatchMode ?? "all";
  const openedPaths = getOpenedPaths(options.slicerHistory ?? []);
  const recentlyOpenedPaths = getRecentlyOpenedPaths(options.slicerHistory ?? [], options.now ?? Date.now());

  const filteredModels = getFolderScopeModels(models, selectedFolder, includeSubfolders).filter((model) => {
    const normalizedModelFolder = normalizeFolder(model.relativeFolder);
    const modelMetadata = metadataByPath.get(normalizeModelPath(model.absolutePath));

    if (isFolderExcluded(normalizedModelFolder, excludedFolders)) {
      return false;
    }

    if (visibleExtensions && !visibleExtensions.has(model.extension)) {
      return false;
    }

    if (options.onlySelected && !options.selectedIds?.has(model.id)) {
      return false;
    }

    if (options.onlyDuplicates && !options.duplicateIds?.has(model.id)) {
      return false;
    }

    if (options.onlyFavorites && !modelMetadata?.favorite) {
      return false;
    }

    const normalizedModelPath = normalizeModelPath(model.absolutePath);
    if (usageFilter === "recent" && !recentlyOpenedPaths.has(normalizedModelPath)) {
      return false;
    }

    if (usageFilter === "never" && openedPaths.has(normalizedModelPath)) {
      return false;
    }

    const notes = modelMetadata?.notes.trim() ?? "";
    if (notesFilter === "with-notes" && !notes) {
      return false;
    }

    if (notesFilter === "without-notes" && notes) {
      return false;
    }

    if (!matchesTags(modelMetadata?.tags ?? [], selectedTags, tagMatchMode)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return `${model.name} ${normalizedModelFolder} ${modelMetadata?.tags.join(" ") ?? ""} ${notes}`
      .toLowerCase()
      .includes(normalizedSearch);
  });

  return filteredModels.sort((left, right) => sortModels(left, right, sortMode));
}

export function getFolderScopeModels(
  models: ModelFile[],
  selectedFolder: string,
  includeSubfolders: boolean
): ModelFile[] {
  const normalizedSelectedFolder = normalizeFolder(selectedFolder);

  return models.filter((model) => {
    const normalizedModelFolder = normalizeFolder(model.relativeFolder);
    if (normalizedSelectedFolder === ALL_FOLDERS_ID) {
      return includeSubfolders || normalizedModelFolder === "";
    }

    return includeSubfolders
      ? isFolderOrDescendant(normalizedModelFolder, normalizedSelectedFolder)
      : normalizedModelFolder === normalizedSelectedFolder;
  });
}

export function isFolderExcluded(
  modelFolder: string,
  exclusions: readonly string[]
): boolean {
  const normalizedModelFolder = normalizeFolder(modelFolder).toLowerCase();

  return exclusions.some((excludedFolder) => {
    const normalizedExclusion = normalizeFolder(excludedFolder).toLowerCase();
    return Boolean(normalizedExclusion) && isFolderOrDescendant(
      normalizedModelFolder,
      normalizedExclusion
    );
  });
}

export function reconcileExcludedFolders(
  exclusions: readonly string[],
  existingFolders: readonly string[]
): string[] {
  const existingFolderKeys = new Set(
    existingFolders.map((folder) => normalizeFolder(folder).toLowerCase()).filter(Boolean)
  );
  const seen = new Set<string>();

  return exclusions.flatMap((folder) => {
    const normalizedFolder = normalizeFolder(folder);
    const key = normalizedFolder.toLowerCase();
    if (!key || seen.has(key) || !existingFolderKeys.has(key)) return [];
    seen.add(key);
    return [normalizedFolder];
  });
}

function matchesTags(modelTags: string[], selectedTags: string[], mode: TagMatchMode): boolean {
  if (selectedTags.length === 0) return true;
  if (mode === "any") return selectedTags.some((tag) => modelTags.includes(tag));
  if (mode === "exclude") return selectedTags.every((tag) => !modelTags.includes(tag));
  return selectedTags.every((tag) => modelTags.includes(tag));
}

function getOpenedPaths(history: SlicerHistoryEntry[]) {
  return new Set(history.map((entry) => normalizeModelPath(entry.modelPath)));
}

function getRecentlyOpenedPaths(history: SlicerHistoryEntry[], now: number) {
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  return new Set(
    history
      .filter((entry) => {
        const openedAt = Date.parse(entry.openedAt);
        return Number.isFinite(openedAt) && openedAt >= cutoff && openedAt <= now;
      })
      .map((entry) => normalizeModelPath(entry.modelPath))
  );
}

function isFolderOrDescendant(modelFolder: string, selectedFolder: string): boolean {
  return modelFolder === selectedFolder || modelFolder.startsWith(`${selectedFolder}/`);
}

function sortModels(left: ModelFile, right: ModelFile, sortMode: ModelSortMode): number {
  if (sortMode === "modified") {
    return Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt) || left.name.localeCompare(right.name);
  }

  if (sortMode === "size") {
    return right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name);
  }

  return left.name.localeCompare(right.name);
}

function normalizeFolder(folder: string): string {
  return folder.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function normalizeMetadataPathMap(
  metadataByPath: Record<string, ModelUserMetadata>
): Map<string, ModelUserMetadata> {
  return new Map(
    Object.entries(metadataByPath).map(([modelPath, metadata]) => [
      normalizeModelPath(modelPath),
      {
        ...metadata,
        tags: normalizeTags(metadata.tags ?? [])
      }
    ])
  );
}

function normalizeModelPath(modelPath: string): string {
  return modelPath.replaceAll("\\", "/").toLowerCase();
}
