import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("localized Electron contract", () => {
  it("uses the persisted locale for native Windows dialogs", async () => {
    const mainSource = await readFile("electron/main.ts", "utf8");

    expect(mainSource).toContain("function mainT(");
    expect(mainSource).toContain('mainT("dialog.chooseLibraryFolder")');
    expect(mainSource).toContain('mainT("dialog.chooseSlicerExecutable")');
    expect(mainSource).toContain('mainT("dialog.executables")');
    expect(mainSource).toContain('mainT("dialog.choose7Zip")');
    expect(mainSource).not.toContain('title: "Escolha sua pasta de STLs e 3MFs"');
    expect(mainSource).not.toContain('title: "Escolha o executável do slicer"');
  });
});
