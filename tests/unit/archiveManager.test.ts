import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractArchiveEntries, listArchiveEntries } from "../../electron/services/archiveManager";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "model-archives-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("archiveManager", () => {
  it("lists printable model entries inside a zip archive", async () => {
    const archivePath = path.join(tempRoot, "pack.zip");
    await writeFile(
      archivePath,
      zipSync({
        "folder/part.stl": strToU8("solid part\nendsolid part"),
        "folder/model.3mf": new Uint8Array([1, 2, 3]),
        "readme.txt": strToU8("ignore")
      })
    );

    const result = await listArchiveEntries(tempRoot, archivePath);

    expect(result).toEqual({
      ok: true,
      archivePath,
      entries: [
        {
          path: "folder/model.3mf",
          name: "model.3mf",
          extension: ".3mf",
          sizeBytes: 3
        },
        {
          path: "folder/part.stl",
          name: "part.stl",
          extension: ".stl",
          sizeBytes: 24
        }
      ]
    });
  });

  it("extracts selected zip entries into a folder inside the library", async () => {
    await mkdir(path.join(tempRoot, "archives"));
    const archivePath = path.join(tempRoot, "archives", "pack.zip");
    await writeFile(
      archivePath,
      zipSync({
        "folder/part.stl": strToU8("solid part\nendsolid part"),
        "folder/model.3mf": new Uint8Array([1, 2, 3])
      })
    );

    const result = await extractArchiveEntries(tempRoot, archivePath, ["folder/part.stl"]);

    expect(result.message).toBe("1 arquivo extraido.");
    expect(result.paths).toEqual([path.join(tempRoot, "archives", "pack", "folder", "part.stl")]);
    await expect(readFile(path.join(tempRoot, "archives", "pack", "folder", "part.stl"), "utf8"))
      .resolves.toBe("solid part\nendsolid part");
    await expect(stat(path.join(tempRoot, "archives", "pack", "folder", "model.3mf"))).rejects.toThrow(
      "ENOENT"
    );
  });

  it("rejects zip entries that would extract outside the library", async () => {
    const archivePath = path.join(tempRoot, "bad.zip");
    await writeFile(
      archivePath,
      zipSync({
        "../escape.stl": strToU8("solid escape\nendsolid escape")
      })
    );

    await expect(extractArchiveEntries(tempRoot, archivePath, ["../escape.stl"])).rejects.toThrow(
      "Entrada insegura no arquivo compactado"
    );
  });
});
