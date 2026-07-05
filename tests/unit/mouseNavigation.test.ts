import { describe, expect, it } from "vitest";
import { getMouseNavigationIntent } from "../../src/lib/mouseNavigation";

describe("getMouseNavigationIntent", () => {
  it("maps auxiliary mouse buttons to folder navigation intents", () => {
    expect(getMouseNavigationIntent(3)).toBe("back");
    expect(getMouseNavigationIntent(4)).toBe("forward");
  });

  it("ignores regular mouse buttons", () => {
    expect(getMouseNavigationIntent(0)).toBeNull();
    expect(getMouseNavigationIntent(1)).toBeNull();
    expect(getMouseNavigationIntent(2)).toBeNull();
  });
});
