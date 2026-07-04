export type FolderNavigationHistory = {
  back: string[];
  forward: string[];
};

export type FolderNavigationResult = {
  folderId: string;
  history: FolderNavigationHistory;
};

const HISTORY_LIMIT = 50;

export function createFolderNavigationHistory(): FolderNavigationHistory {
  return {
    back: [],
    forward: []
  };
}

export function pushFolderHistory(
  history: FolderNavigationHistory,
  currentFolderId: string,
  nextFolderId: string
): FolderNavigationHistory {
  if (currentFolderId === nextFolderId) {
    return history;
  }

  return {
    back: [...history.back, currentFolderId].slice(-HISTORY_LIMIT),
    forward: []
  };
}

export function goBackInFolderHistory(
  history: FolderNavigationHistory,
  currentFolderId: string
): FolderNavigationResult | null {
  const folderId = history.back.at(-1);

  if (!folderId) {
    return null;
  }

  return {
    folderId,
    history: {
      back: history.back.slice(0, -1),
      forward: [currentFolderId, ...history.forward].slice(0, HISTORY_LIMIT)
    }
  };
}

export function goForwardInFolderHistory(
  history: FolderNavigationHistory,
  currentFolderId: string
): FolderNavigationResult | null {
  const folderId = history.forward[0];

  if (!folderId) {
    return null;
  }

  return {
    folderId,
    history: {
      back: [...history.back, currentFolderId].slice(-HISTORY_LIMIT),
      forward: history.forward.slice(1)
    }
  };
}
