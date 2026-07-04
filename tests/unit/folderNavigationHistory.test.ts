import { describe, expect, it } from "vitest";
import {
  createFolderNavigationHistory,
  goBackInFolderHistory,
  goForwardInFolderHistory,
  pushFolderHistory
} from "../../src/lib/folderNavigationHistory";

describe("folderNavigationHistory", () => {
  it("pushes a previous folder and clears forward history", () => {
    const history = pushFolderHistory(
      { back: ["old"], forward: ["future"] },
      "current",
      "next"
    );

    expect(history).toEqual({ back: ["old", "current"], forward: [] });
  });

  it("does not push when the folder did not change", () => {
    const history = pushFolderHistory(createFolderNavigationHistory(), "current", "current");

    expect(history).toEqual(createFolderNavigationHistory());
  });

  it("can navigate back and forward", () => {
    const initialHistory = { back: ["a", "b"], forward: [] };
    const backResult = goBackInFolderHistory(initialHistory, "c");

    expect(backResult).toEqual({
      folderId: "b",
      history: { back: ["a"], forward: ["c"] }
    });

    expect(goForwardInFolderHistory(backResult.history, "b")).toEqual({
      folderId: "c",
      history: { back: ["a", "b"], forward: [] }
    });
  });
});
