import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Electron preload contract", () => {
  it("uses a CommonJS preload file so Electron can load the bridge", async () => {
    const preloadSource = await readFile("electron/preload.cjs", "utf8");

    expect(preloadSource).toContain("require(\"electron\")");
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld(\"modelLibrary\"");
    expect(preloadSource).toContain("readModelMetadata");
    expect(preloadSource).toContain("readModelThumbnail");
    expect(preloadSource).toContain("createFolder");
    expect(preloadSource).toContain("moveModels");
    expect(preloadSource).toContain("renameFolder");
    expect(preloadSource).toContain("renameModelFile");
    expect(preloadSource).toContain("trashModels");
    expect(preloadSource).toContain("restoreLibraryPaths");
    expect(preloadSource).toContain("getLibraryMetadata");
    expect(preloadSource).toContain("toggleFavorite");
    expect(preloadSource).toContain("setModelTags");
    expect(preloadSource).toContain("setModelNotes");
    expect(preloadSource).toContain("showModelInFolder");
    expect(preloadSource).not.toContain("import ");
  });
});
