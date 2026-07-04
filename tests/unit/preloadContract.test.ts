import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Electron preload contract", () => {
  it("uses a CommonJS preload file so Electron can load the bridge", async () => {
    const preloadSource = await readFile("electron/preload.cjs", "utf8");

    expect(preloadSource).toContain("require(\"electron\")");
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld(\"modelLibrary\"");
    expect(preloadSource).toContain("readModelMetadata");
    expect(preloadSource).not.toContain("import ");
  });
});
