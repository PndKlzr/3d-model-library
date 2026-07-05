export type ModelViewMode = "grid" | "list";

export function parseModelViewMode(value: string | null): ModelViewMode {
  return value === "list" ? "list" : "grid";
}
