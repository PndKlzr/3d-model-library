import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspectConfiguredSlicers, resolveSlicerExecutable } from "../../electron/services/slicerExecutable";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "slicer-executable-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("resolveSlicerExecutable", () => {
  it.each([
    ["relative path", "Cura.exe"],
    ["non-executable extension", path.join(os.tmpdir(), "Cura.txt")]
  ])("rejects a %s", async (_label, candidatePath) => {
    await expect(resolveSlicerExecutable(candidatePath)).rejects.toThrow();
  });

  it("rejects missing files and directories", async () => {
    const directory = path.join(tempRoot, "Cura.exe");
    await mkdir(directory);

    await expect(resolveSlicerExecutable(path.join(tempRoot, "missing.exe"))).rejects.toThrow();
    await expect(resolveSlicerExecutable(directory)).rejects.toThrow();
  });

  it("rejects symbolic links", async () => {
    const link = path.join(tempRoot, "Cura-link.exe");
    const adapters = {
      lstat: async () => ({ isFile: () => true, isSymbolicLink: () => true }),
      realpath: async () => link,
      stat: async () => ({ isFile: () => true })
    };

    await expect(resolveSlicerExecutable(link, adapters as never)).rejects.toThrow();
  });

  it("returns the canonical path of a regular executable", async () => {
    const executable = path.join(tempRoot, "Cura.exe");
    await writeFile(executable, "test executable");

    await expect(resolveSlicerExecutable(executable)).resolves.toBe(await realpath(executable));
  });
});

describe("inspectConfiguredSlicers", () => {
  it("returns only ids whose configured executable has disappeared", async () => {
    const existingPath = path.join(tempRoot, "Cura.exe");
    await writeFile(existingPath, "exe");
    const missingPath = path.join(tempRoot, "Orca.exe");

    expect(await inspectConfiguredSlicers([
      { id: "cura", executablePath: existingPath },
      { id: "orca-slicer", executablePath: missingPath },
      { id: "prusa-slicer", executablePath: "" }
    ])).toEqual(["orca-slicer"]);
  });
});
