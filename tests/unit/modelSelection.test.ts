import { describe, expect, it } from "vitest";
import { updateSelectionForGesture } from "../../src/lib/modelSelection";

const orderedIds = ["a", "b", "c", "d"];

describe("updateSelectionForGesture", () => {
  it("selects only the clicked model for a plain click", () => {
    const result = updateSelectionForGesture({
      orderedIds,
      selectedIds: new Set(["a", "b"]),
      clickedId: "c",
      lastSelectedId: "b",
      ctrlKey: false,
      shiftKey: false
    });

    expect([...result.selectedIds]).toEqual(["c"]);
    expect(result.lastSelectedId).toBe("c");
  });

  it("toggles a model with Ctrl without losing the rest of the selection", () => {
    const result = updateSelectionForGesture({
      orderedIds,
      selectedIds: new Set(["a", "b"]),
      clickedId: "b",
      lastSelectedId: "a",
      ctrlKey: true,
      shiftKey: false
    });

    expect([...result.selectedIds]).toEqual(["a"]);
    expect(result.lastSelectedId).toBe("b");
  });

  it("selects the range between the last selected model and the clicked model with Shift", () => {
    const result = updateSelectionForGesture({
      orderedIds,
      selectedIds: new Set(["a"]),
      clickedId: "d",
      lastSelectedId: "b",
      ctrlKey: false,
      shiftKey: true
    });

    expect([...result.selectedIds]).toEqual(["b", "c", "d"]);
    expect(result.lastSelectedId).toBe("b");
  });
});
