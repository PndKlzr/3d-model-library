import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  createLibraryFolder,
  moveLibraryFolder,
  moveModelFiles,
  trashLibraryFolder,
  trashModelFiles,
  renameLibraryFolder,
  renameModelFile,
  restoreLibraryPaths,
  saveConvertedStlFile
} from "../../electron/services/fileOrganizer";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "model-organizer-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("file organizer", () => {
  it("creates a folder under the requested library folder", async () => {
    await mkdir(path.join(tempRoot, "props"));

    const result = await createLibraryFolder(tempRoot, "props", "Brackets");

    expect(result).toEqual({
      ok: true,
      message: "Pasta criada.",
      path: path.join(tempRoot, "props", "Brackets")
    });
    await expect(stat(path.join(tempRoot, "props", "Brackets"))).resolves.toMatchObject({
      isDirectory: expect.any(Function)
    });
  });

  it("moves model files to an existing folder without overwriting", async () => {
    await mkdir(path.join(tempRoot, "sorted"));
    const sourcePath = path.join(tempRoot, "bench.stl");
    await writeFile(sourcePath, "solid bench");

    const result = await moveModelFiles(tempRoot, [sourcePath], "sorted");

    expect(result).toEqual({ ok: true, message: "1 arquivo movido." });
    await expect(readFile(path.join(tempRoot, "sorted", "bench.stl"), "utf8")).resolves.toBe(
      "solid bench"
    );
    await expect(stat(sourcePath)).rejects.toThrow("ENOENT");
  });

  it("rejects a move when the destination already has the same filename", async () => {
    await mkdir(path.join(tempRoot, "sorted"));
    const sourcePath = path.join(tempRoot, "bench.stl");
    await writeFile(sourcePath, "new");
    await writeFile(path.join(tempRoot, "sorted", "bench.stl"), "existing");

    await expect(moveModelFiles(tempRoot, [sourcePath], "sorted")).rejects.toThrow(
      "Ja existe um arquivo com esse nome na pasta destino"
    );
    await expect(readFile(sourcePath, "utf8")).resolves.toBe("new");
  });

  it("rejects duplicate destination filenames before moving any file", async () => {
    await mkdir(path.join(tempRoot, "a"));
    await mkdir(path.join(tempRoot, "b"));
    await mkdir(path.join(tempRoot, "sorted"));
    const firstPath = path.join(tempRoot, "a", "part.stl");
    const secondPath = path.join(tempRoot, "b", "part.stl");
    await writeFile(firstPath, "first");
    await writeFile(secondPath, "second");

    await expect(moveModelFiles(tempRoot, [firstPath, secondPath], "sorted")).rejects.toThrow(
      "Mais de um arquivo selecionado tem o mesmo nome"
    );
    await expect(readFile(firstPath, "utf8")).resolves.toBe("first");
    await expect(readFile(secondPath, "utf8")).resolves.toBe("second");
  });

  it("sends valid model files to the configured trash handler", async () => {
    const sourcePath = path.join(tempRoot, "bench.stl");
    await writeFile(sourcePath, "solid bench");
    const trashedPaths: string[] = [];

    const result = await trashModelFiles(tempRoot, [sourcePath], async (modelPath) => {
      trashedPaths.push(modelPath);
    });

    expect(result).toEqual({
      ok: true,
      message: "1 arquivo movido para a Lixeira.",
      paths: [sourcePath]
    });
    expect(trashedPaths).toEqual([sourcePath]);
  });

  it("validates every trashed model before calling the trash handler", async () => {
    const validPath = path.join(tempRoot, "bench.stl");
    const invalidPath = path.join(tempRoot, "notes.txt");
    await writeFile(validPath, "solid bench");
    await writeFile(invalidPath, "notes");
    const trashedPaths: string[] = [];

    await expect(
      trashModelFiles(tempRoot, [validPath, invalidPath], async (modelPath) => {
        trashedPaths.push(modelPath);
      })
    ).rejects.toThrow("Arquivo de modelo invalido");

    expect(trashedPaths).toEqual([]);
  });

  it("renames folders without leaving the library root", async () => {
    await mkdir(path.join(tempRoot, "old-name"));

    const result = await renameLibraryFolder(tempRoot, "old-name", "new-name");

    expect(result).toEqual({
      ok: true,
      message: "Pasta renomeada.",
      path: path.join(tempRoot, "new-name")
    });
    await expect(stat(path.join(tempRoot, "new-name"))).resolves.toBeTruthy();
    await expect(stat(path.join(tempRoot, "old-name"))).rejects.toThrow("ENOENT");
  });

  it("moves folders into another library folder without moving into itself", async () => {
    await mkdir(path.join(tempRoot, "props", "clips"), { recursive: true });
    await mkdir(path.join(tempRoot, "sorted"));

    const result = await moveLibraryFolder(tempRoot, "props/clips", "sorted");

    expect(result).toEqual({
      ok: true,
      message: "Pasta movida.",
      path: path.join(tempRoot, "sorted", "clips")
    });
    await expect(stat(path.join(tempRoot, "sorted", "clips"))).resolves.toBeTruthy();
    await expect(stat(path.join(tempRoot, "props", "clips"))).rejects.toThrow("ENOENT");
    await expect(moveLibraryFolder(tempRoot, "sorted", "sorted/clips")).rejects.toThrow(
      "Nao e possivel mover uma pasta para dentro dela mesma"
    );
  });

  it("sends a library folder to the configured trash handler", async () => {
    await mkdir(path.join(tempRoot, "old-folder"));
    const trashedPaths: string[] = [];

    const result = await trashLibraryFolder(tempRoot, "old-folder", async (folderPath) => {
      trashedPaths.push(folderPath);
    });

    expect(result).toEqual({
      ok: true,
      message: "Pasta movida para a Lixeira.",
      path: path.join(tempRoot, "old-folder")
    });
    expect(trashedPaths).toEqual([path.join(tempRoot, "old-folder")]);
  });

  it("renames files while preserving their model extension", async () => {
    const sourcePath = path.join(tempRoot, "clip.3mf");
    await writeFile(sourcePath, "model");

    const result = await renameModelFile(tempRoot, sourcePath, "better clip");

    expect(result).toEqual({
      ok: true,
      message: "Arquivo renomeado.",
      path: path.join(tempRoot, "better clip.3mf")
    });
    await expect(readFile(path.join(tempRoot, "better clip.3mf"), "utf8")).resolves.toBe("model");
  });

  it("saves converted STL files next to the source 3MF", async () => {
    const sourcePath = path.join(tempRoot, "clip.3mf");
    await writeFile(sourcePath, "model");

    const result = await saveConvertedStlFile(tempRoot, sourcePath, "solid converted\nendsolid converted");

    expect(result).toEqual({
      ok: true,
      message: "STL convertido salvo.",
      path: path.join(tempRoot, "clip.stl"),
      paths: [path.join(tempRoot, "clip.stl")]
    });
    await expect(readFile(path.join(tempRoot, "clip.stl"), "utf8")).resolves.toBe(
      "solid converted\nendsolid converted"
    );
  });

  it("restores file operations from current paths back to previous paths", async () => {
    await mkdir(path.join(tempRoot, "sorted"));
    const sourcePath = path.join(tempRoot, "bench.stl");
    const movedPath = path.join(tempRoot, "sorted", "bench.stl");
    await writeFile(movedPath, "solid bench");

    const result = await restoreLibraryPaths(tempRoot, [
      { sourcePath: movedPath, destinationPath: sourcePath }
    ]);

    expect(result).toEqual({
      ok: true,
      message: "Acao desfeita.",
      paths: [sourcePath]
    });
    await expect(readFile(sourcePath, "utf8")).resolves.toBe("solid bench");
    await expect(stat(movedPath)).rejects.toThrow("ENOENT");
  });

  it("refuses to restore over an existing destination", async () => {
    await mkdir(path.join(tempRoot, "sorted"));
    const sourcePath = path.join(tempRoot, "bench.stl");
    const movedPath = path.join(tempRoot, "sorted", "bench.stl");
    await writeFile(sourcePath, "existing");
    await writeFile(movedPath, "moved");

    await expect(
      restoreLibraryPaths(tempRoot, [{ sourcePath: movedPath, destinationPath: sourcePath }])
    ).rejects.toThrow("Ja existe um arquivo ou pasta no caminho de restauracao");

    await expect(readFile(sourcePath, "utf8")).resolves.toBe("existing");
    await expect(readFile(movedPath, "utf8")).resolves.toBe("moved");
  });

  it("rejects names with Windows-invalid characters", async () => {
    await expect(createLibraryFolder(tempRoot, "", "bad:name")).rejects.toThrow("Nome invalido");
  });

  it("rejects paths outside the library", async () => {
    const outsidePath = path.join(os.tmpdir(), "outside-model.stl");
    await writeFile(outsidePath, "outside");

    await expect(moveModelFiles(tempRoot, [outsidePath], "")).rejects.toThrow(
      "fora da biblioteca"
    );

    await rm(outsidePath, { force: true });
  });
});
