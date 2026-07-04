import { describe, expect, it } from "vitest";
import { appendActionLogEntry, markActionUndone } from "../../src/lib/actionLog";
import type { LibraryActionLogEntry } from "../../src/shared/types";

describe("actionLog", () => {
  it("keeps newest actions first and limits the list", () => {
    const entries = Array.from({ length: 25 }, (_, index) =>
      entry(`action-${index}`, `Action ${index}`)
    ).reduce<LibraryActionLogEntry[]>(
      (currentEntries, nextEntry) => appendActionLogEntry(currentEntries, nextEntry),
      []
    );

    expect(entries).toHaveLength(20);
    expect(entries[0].id).toBe("action-24");
    expect(entries.at(-1)?.id).toBe("action-5");
  });

  it("marks an action as undone", () => {
    const entries = [entry("move-1", "Move", true), entry("trash-1", "Trash")];

    expect(markActionUndone(entries, "move-1")).toEqual([
      { ...entries[0], undone: true, undoable: false },
      entries[1]
    ]);
  });
});

function entry(
  id: string,
  label: string,
  undoable = false
): LibraryActionLogEntry {
  return {
    id,
    label,
    detail: "",
    createdAt: "2026-07-04T00:00:00.000Z",
    undoable,
    undone: false
  };
}
