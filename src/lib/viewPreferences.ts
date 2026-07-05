export type ModelViewMode = "grid" | "list";
export type ThemeMode = "light" | "dark";

export function parseModelViewMode(value: string | null): ModelViewMode {
  return value === "list" ? "list" : "grid";
}

export function parseThemeMode(value: string | null): ThemeMode {
  return value === "dark" ? "dark" : "light";
}
