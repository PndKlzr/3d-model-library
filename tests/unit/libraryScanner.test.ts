import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanLibrary } from "../../electron/services/libraryScanner";

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
});
