import { describe, expect, it } from "vitest";
import { getContextMenuPosition } from "../../src/lib/contextMenuPosition";

describe("getContextMenuPosition", () => {
  it("keeps a menu inside the bottom and right viewport edges", () => {
    expect(
      getContextMenuPosition({
        x: 760,
        y: 560,
        viewportWidth: 800,
        viewportHeight: 600,
        menuWidth: 240,
        menuHeight: 260
      })
    ).toEqual({
      left: 548,
      top: 328
    });
  });

  it("keeps the pointer position when the menu already fits", () => {
    expect(
      getContextMenuPosition({
        x: 120,
        y: 140,
        viewportWidth: 800,
        viewportHeight: 600,
        menuWidth: 240,
        menuHeight: 260
      })
    ).toEqual({
      left: 120,
      top: 140
    });
  });
});
