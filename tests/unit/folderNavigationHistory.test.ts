import { describe, expect, it } from "vitest";
import {
  createFolderNavigationEntry,
  createFolderNavigationHistory,
  goBackInFolderHistory,
  goForwardInFolderHistory,
  pushFolderHistory
} from "../../src/lib/folderNavigationHistory";

describe("folderNavigationHistory", () => {
  it("pushes a previous folder and clears forward history", () => {
    const old = createFolderNavigationEntry("old");
    const current = createFolderNavigationEntry("current", { searchQuery: "gear", scrollTop: 420 });
    const history = pushFolderHistory(
      { back: [old], forward: [createFolderNavigationEntry("future")] },
      current,
      "next"
    );

    expect(history).toEqual({ back: [old, current], forward: [] });
  });

  it("does not push when the folder did not change", () => {
    const history = pushFolderHistory(
      createFolderNavigationHistory(),
      createFolderNavigationEntry("current"),
      "current"
    );

    expect(history).toEqual(createFolderNavigationHistory());
  });

  it("can navigate back and forward", () => {
    const a = createFolderNavigationEntry("a");
    const b = createFolderNavigationEntry("b", { onlyFavorites: true, scrollTop: 240 });
    const c = createFolderNavigationEntry("c", { searchQuery: "robot" });
    const initialHistory = { back: [a, b], forward: [] };
    const backResult = goBackInFolderHistory(initialHistory, c);

    expect(backResult).toEqual({
      entry: b,
      history: { back: [a], forward: [c] }
    });

    expect(goForwardInFolderHistory(backResult.history, b)).toEqual({
      entry: c,
      history: { back: [a, b], forward: [] }
    });
  });
});
