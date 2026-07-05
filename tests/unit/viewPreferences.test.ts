import { describe, expect, it } from "vitest";
import { parseModelViewMode } from "../../src/lib/viewPreferences";

describe("view preferences", () => {
  it("accepts only known model view modes", () => {
    expect(parseModelViewMode("grid")).toBe("grid");
    expect(parseModelViewMode("list")).toBe("list");
    expect(parseModelViewMode("cards")).toBe("grid");
    expect(parseModelViewMode(null)).toBe("grid");
  });
});
