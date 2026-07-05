import { describe, expect, it } from "vitest";
import { parseModelViewMode, parseThemeMode } from "../../src/lib/viewPreferences";

describe("view preferences", () => {
  it("accepts only known model view modes", () => {
    expect(parseModelViewMode("grid")).toBe("grid");
    expect(parseModelViewMode("list")).toBe("list");
    expect(parseModelViewMode("cards")).toBe("grid");
    expect(parseModelViewMode(null)).toBe("grid");
  });

  it("accepts only known theme modes", () => {
    expect(parseThemeMode("light")).toBe("light");
    expect(parseThemeMode("dark")).toBe("dark");
    expect(parseThemeMode("contrast")).toBe("light");
    expect(parseThemeMode(null)).toBe("light");
  });
});
