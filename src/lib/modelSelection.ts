export type SelectionGesture = {
  orderedIds: string[];
  selectedIds: Set<string>;
  clickedId: string;
  lastSelectedId: string | null;
  ctrlKey: boolean;
  shiftKey: boolean;
};

export type SelectionGestureResult = {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
};

export function updateSelectionForGesture({
  orderedIds,
  selectedIds,
  clickedId,
  lastSelectedId,
  ctrlKey,
  shiftKey
}: SelectionGesture): SelectionGestureResult {
  if (shiftKey && lastSelectedId && orderedIds.includes(lastSelectedId)) {
    const clickedIndex = orderedIds.indexOf(clickedId);
    const anchorIndex = orderedIds.indexOf(lastSelectedId);

    if (clickedIndex >= 0 && anchorIndex >= 0) {
      const [start, end] =
        clickedIndex > anchorIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex];

      return {
        selectedIds: new Set(orderedIds.slice(start, end + 1)),
        lastSelectedId
      };
    }
  }

  if (ctrlKey) {
    const nextIds = new Set(selectedIds);

    if (nextIds.has(clickedId)) {
      nextIds.delete(clickedId);
    } else {
      nextIds.add(clickedId);
    }

    return { selectedIds: nextIds, lastSelectedId: clickedId };
  }

  return { selectedIds: new Set([clickedId]), lastSelectedId: clickedId };
}
