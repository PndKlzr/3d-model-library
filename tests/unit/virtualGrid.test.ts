import { describe, expect, it } from "vitest";
import { buildVirtualRows } from "../../src/lib/virtualGrid";

describe("virtualGrid", () => {
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
