export function buildVirtualRows<T>(items: T[], columns: number): T[][] {
  const safeColumns = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];

  for (let index = 0; index < items.length; index += safeColumns) {
    rows.push(items.slice(index, index + safeColumns));
  }

  return rows;
}
