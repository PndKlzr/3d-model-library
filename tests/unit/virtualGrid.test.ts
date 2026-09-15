import { describe, expect, it } from "vitest";
import { buildVirtualRows, findVirtualRowIndex } from "../../src/lib/virtualGrid";

describe("virtualGrid", () => {
  it("finds the row that contains a requested item", () => {
    expect(findVirtualRowIndex(["folder:a", "model:a", "model:b", "model:c"], 3, "model:c"))
      .toBe(1);
    expect(findVirtualRowIndex(["model:a"], 3, "missing")).toBeNull();
  });

  it("groups mixed items without dropping their order", () => {
    expect(buildVirtualRows(["a", "b", "c", "d", "e"], 3)).toEqual([
      ["a", "b", "c"],
      ["d", "e"]
    ]);
  });

  it("uses at least one column", () => {
    expect(buildVirtualRows([1, 2], 0)).toEqual([[1], [2]]);
  });

  it("returns no rows for an empty collection", () => {
    expect(buildVirtualRows([], 4)).toEqual([]);
  });
});
