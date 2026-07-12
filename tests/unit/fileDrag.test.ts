import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createNativeFileDragPayload,
  resolveDraggableFilePaths,
  resolveDraggableFilePathsSync
} from "../../electron/services/fileDrag";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "model-drag-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("fileDrag", () => {
  it("allows STL and 3MF files inside the configured library", async () => {
    const stlPath = path.join(tempRoot, "part.stl");
    const threeMfPath = path.join(tempRoot, "nested", "part.3mf");
    await mkdir(path.dirname(threeMfPath), { recursive: true });
    await writeFile(stlPath, "solid part");
    await writeFile(threeMfPath, "3mf");

    await expect(resolveDraggableFilePaths(tempRoot, [stlPath, threeMfPath])).resolves.toEqual([
      stlPath,
      threeMfPath
    ]);
    expect(resolveDraggableFilePathsSync(tempRoot, [stlPath, threeMfPath])).toEqual([
      stlPath,
      threeMfPath
    ]);
  });

  it("rejects files outside the configured library", async () => {
    const outsidePath = path.join(os.tmpdir(), "outside.stl");
    await writeFile(outsidePath, "solid outside");

    await expect(resolveDraggableFilePaths(tempRoot, [outsidePath])).rejects.toThrow(
      "Arquivo fora da biblioteca."
    );
    expect(() => resolveDraggableFilePathsSync(tempRoot, [outsidePath])).toThrow(
      "Arquivo fora da biblioteca."
    );
  });

  it("allows supported archive files for drag-out to Explorer or desktop", async () => {
    const archivePath = path.join(tempRoot, "pack.zip");
    await writeFile(archivePath, "zip");

    await expect(resolveDraggableFilePaths(tempRoot, [archivePath])).resolves.toEqual([
      archivePath
    ]);
    expect(resolveDraggableFilePathsSync(tempRoot, [archivePath])).toEqual([archivePath]);
  });

  it("deduplicates repeated file paths", async () => {
    const filePath = path.join(tempRoot, "part.stl");
    await writeFile(filePath, "solid part");

    await expect(resolveDraggableFilePaths(tempRoot, [filePath, filePath])).resolves.toEqual([
      filePath
    ]);
    expect(resolveDraggableFilePathsSync(tempRoot, [filePath, filePath])).toEqual([filePath]);
  });

  it("rejects unsupported files before creating a native payload", async () => {
    const filePath = path.join(tempRoot, "notes.txt");
    await writeFile(filePath, "notes");

    await expect(resolveDraggableFilePaths(tempRoot, [filePath])).rejects.toThrow(
      "Arraste externo aceita apenas STL, 3MF, ZIP, RAR e 7Z."
    );
    expect(() => resolveDraggableFilePathsSync(tempRoot, [filePath])).toThrow(
      "Arraste externo aceita apenas STL, 3MF, ZIP, RAR e 7Z."
    );
  });

  it("uses a single file payload when dragging one model out", () => {
    const icon = {};
    const filePath = path.join(tempRoot, "part.stl");

    expect(createNativeFileDragPayload([filePath], icon)).toEqual({
      file: filePath,
      icon
    });
  });

  it("uses a files payload only when dragging multiple models out", () => {
    const icon = {};
    const filePath = path.join(tempRoot, "part.stl");
    const secondFilePath = path.join(tempRoot, "part.3mf");

    expect(createNativeFileDragPayload([filePath, secondFilePath], icon)).toEqual({
      file: filePath,
      files: [filePath, secondFilePath],
      icon
    });
  });
});
