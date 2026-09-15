import {
  type ModelSortMode,
  type NotesFilter,
  type TagMatchMode,
  type UsageFilter
} from "./folderFilters";

export type FolderNavigationEntry = {
  folderId: string;
  searchQuery: string;
  sortMode: ModelSortMode;
  onlySelected: boolean;
  onlyFavorites: boolean;
  onlyDuplicates: boolean;
  usageFilter: UsageFilter;
  notesFilter: NotesFilter;
  tagMatchMode: TagMatchMode;
  selectedTags: string[];
  scrollTop: number;
};

export type FolderNavigationHistory = {
  back: FolderNavigationEntry[];
  forward: FolderNavigationEntry[];
};

export type FolderNavigationResult = {
  entry: FolderNavigationEntry;
  history: FolderNavigationHistory;
};

const HISTORY_LIMIT = 50;

export function createFolderNavigationEntry(
  folderId: string,
  overrides: Partial<Omit<FolderNavigationEntry, "folderId">> = {}
): FolderNavigationEntry {
  return {
    folderId,
    searchQuery: "",
    sortMode: "name",
    onlySelected: false,
    onlyFavorites: false,
    onlyDuplicates: false,
    usageFilter: "all",
    notesFilter: "all",
    tagMatchMode: "all",
    selectedTags: [],
    scrollTop: 0,
    ...overrides
  };
}

export function createFolderNavigationHistory(): FolderNavigationHistory {
  return { back: [], forward: [] };
}

export function pushFolderHistory(
  history: FolderNavigationHistory,
  currentEntry: FolderNavigationEntry,
  nextFolderId: string
): FolderNavigationHistory {
  if (currentEntry.folderId === nextFolderId) return history;
  return {
    back: [...history.back, cloneEntry(currentEntry)].slice(-HISTORY_LIMIT),
    forward: []
  };
}

export function goBackInFolderHistory(
  history: FolderNavigationHistory,
  currentEntry: FolderNavigationEntry
): FolderNavigationResult | null {
  const entry = history.back.at(-1);
  if (!entry) return null;
  return {
    entry: cloneEntry(entry),
    history: {
      back: history.back.slice(0, -1),
      forward: [cloneEntry(currentEntry), ...history.forward].slice(0, HISTORY_LIMIT)
    }
  };
}

export function goForwardInFolderHistory(
  history: FolderNavigationHistory,
  currentEntry: FolderNavigationEntry
): FolderNavigationResult | null {
  const entry = history.forward[0];
  if (!entry) return null;
  return {
    entry: cloneEntry(entry),
    history: {
      back: [...history.back, cloneEntry(currentEntry)].slice(-HISTORY_LIMIT),
      forward: history.forward.slice(1)
    }
  };
}

function cloneEntry(entry: FolderNavigationEntry): FolderNavigationEntry {
  return { ...entry, selectedTags: [...entry.selectedTags] };
}
