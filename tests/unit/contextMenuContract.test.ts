import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("folder context menu contract", () => {
  it("does not change the open folder when showing the context menu", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const contextMenuHandler = appSource.match(
      /function openFolderContextMenu[\s\S]*?\n  }\n/
    )?.[0];

    expect(contextMenuHandler).toBeTruthy();
    expect(contextMenuHandler).not.toContain("setSelectedFolder");
  });
});
