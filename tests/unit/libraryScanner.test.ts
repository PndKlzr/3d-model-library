import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyLibraryWatchEvents, scanLibrary } from "../../electron/services/libraryScanner";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "model-library-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("scanLibrary", () => {
  it("finds STL and 3MF files recursively and ignores other extensions", async () => {
    await mkdir(path.join(tempRoot, "props", "terrain"), { recursive: true });
    await writeFile(path.join(tempRoot, "bench.STL"), "solid bench\nendsolid bench");
    await writeFile(path.join(tempRoot, "props", "clip.3mf"), "not a real 3mf yet");
    await writeFile(path.join(tempRoot, "props", "terrain", "rock.stl"), "solid rock\nendsolid rock");
    await writeFile(path.join(tempRoot, "notes.txt"), "ignore me");

    const result = await scanLibrary(tempRoot);

    expect(result.rootPath).toBe(tempRoot);
    expect(result.errors).toEqual([]);
    expect(result.models.map((model) => model.name).sort()).toEqual([
      "bench.STL",
      "clip.3mf",
      "rock.stl"
    ]);
    expect(result.models.map((model) => model.extension).sort()).toEqual([
      ".3mf",
      ".stl",
      ".stl"
    ]);
    expect(result.models.find((model) => model.name === "bench.STL")?.relativeFolder).toBe("");
    expect(result.models.find((model) => model.name === "clip.3mf")?.relativeFolder).toBe("props");
    expect(result.models.find((model) => model.name === "rock.stl")?.relativeFolder).toBe(
      "props/terrain"
    );
    expect(result.folders).toEqual(["props", "props/terrain"]);
  });

  it("includes supported archive files as library items", async () => {
    await writeFile(path.join(tempRoot, "pack.zip"), "zip");
    await writeFile(path.join(tempRoot, "models.rar"), "rar");
    await writeFile(path.join(tempRoot, "parts.7z"), "7z");

    const result = await scanLibrary(tempRoot);

    expect(result.models.map((model) => model.name).sort()).toEqual([
      "models.rar",
      "pack.zip",
      "parts.7z"
    ]);
    expect(result.models.map((model) => model.extension).sort()).toEqual([".7z", ".rar", ".zip"]);
  });

  it("returns empty folders so newly created folders appear in the UI", async () => {
    await mkdir(path.join(tempRoot, "new-folder", "nested"), { recursive: true });

    const result = await scanLibrary(tempRoot);

    expect(result.models).toEqual([]);
    expect(result.folders).toEqual(["new-folder", "new-folder/nested"]);
  });

  it("keeps scanning when a child directory cannot be read", async () => {
    const missingRoot = path.join(tempRoot, "missing");

    const result = await scanLibrary(missingRoot);

    expect(result.models).toEqual([]);
    expect(result.errors[0].path).toBe(missingRoot);
    expect(result.errors[0].message).toContain("ENOENT");
  });

  it("does not parse model geometry during the initial scan", async () => {
    await writeFile(path.join(tempRoot, "corrupt.stl"), "not enough vertex data");

    const result = await scanLibrary(tempRoot);

    expect(result.models[0]).toMatchObject({
      name: "corrupt.stl",
      dimensionsMm: null,
      objectCount: null,
      previewError: null
    });
  });

  it("keeps deterministic ordering when file metadata completes out of order", async () => {
    await mkdir(path.join(tempRoot, "z-folder"), { recursive: true });
    await writeFile(path.join(tempRoot, "z-folder", "beta.stl"), "solid beta\nendsolid beta");
    await writeFile(path.join(tempRoot, "alpha.3mf"), "alpha");
    await writeFile(path.join(tempRoot, "charlie.stl"), "solid charlie\nendsolid charlie");

    const result = await scanLibrary(tempRoot);

    expect(result.models.map((model) => `${model.relativeFolder}/${model.name}`)).toEqual([
      "/alpha.3mf",
      "/charlie.stl",
      "z-folder/beta.stl"
    ]);
  });

  it("applies file and folder watcher events without rescanning the library", async () => {
    const firstPath = path.join(tempRoot, "first.stl");
    const nextFolder = path.join(tempRoot, "new-folder");
    const nextPath = path.join(nextFolder, "next.3mf");
    await writeFile(firstPath, "solid first\nendsolid first");
    const initial = await scanLibrary(tempRoot);
    await mkdir(nextFolder);
    await writeFile(nextPath, "next");
    await rm(firstPath);

    const result = await applyLibraryWatchEvents(initial, [
      { type: "unlink", absolutePath: firstPath },
      { type: "addDir", absolutePath: nextFolder },
      { type: "add", absolutePath: nextPath }
    ]);

    expect(result.models.map((model) => model.name)).toEqual(["next.3mf"]);
    expect(result.folders).toEqual(["new-folder"]);
  });
});
