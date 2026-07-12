import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("native drop probe contract", () => {
  it("records Windows file-drop formats, effects, and absolute paths", async () => {
    const source = await readFile("tools/native-drop-probe/NativeDropProbe.cs", "utf8");

    expect(source).toContain("DataFormats.FileDrop");
    expect(source).toContain("GetFormats(false)");
    expect(source).toContain("AllowedEffect");
    expect(source).toContain("SelectedEffect");
    expect(source).toContain("Path.GetFullPath(file)");
  });
});
