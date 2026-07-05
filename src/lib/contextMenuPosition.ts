export type ContextMenuPositionInput = {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  menuWidth: number;
  menuHeight: number;
  margin?: number;
};

export type ContextMenuPosition = {
  left: number;
  top: number;
};

export function getContextMenuPosition({
  x,
  y,
  viewportWidth,
  viewportHeight,
  menuWidth,
  menuHeight,
  margin = 12
}: ContextMenuPositionInput): ContextMenuPosition {
  return {
    left: clamp(x, margin, viewportWidth - menuWidth - margin),
    top: clamp(y, margin, viewportHeight - menuHeight - margin)
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}
