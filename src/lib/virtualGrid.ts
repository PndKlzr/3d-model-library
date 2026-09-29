export function buildVirtualRows<T>(items: T[], columns: number): T[][] {
  const safeColumns = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];

  for (let index = 0; index < items.length; index += safeColumns) {
    rows.push(items.slice(index, index + safeColumns));
  }

  return rows;
}

export function findVirtualRowIndex(
  itemIds: readonly string[],
  columns: number,
  targetId: string
): number | null {
  const itemIndex = itemIds.indexOf(targetId);
  if (itemIndex < 0) return null;
  return Math.floor(itemIndex / Math.max(1, Math.floor(columns)));
}

export function shouldHandleRevealRequest(
  lastHandledKey: number | null,
  requestKey: number
): boolean {
  return lastHandledKey !== requestKey;
}
