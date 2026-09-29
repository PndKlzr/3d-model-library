import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SlicerConfig } from "../../src/shared/types";
import { launchSlicer } from "../../electron/services/slicerLauncher";

let tempRoot: string;
let modelPath: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "slicer-launcher-"));
  modelPath = path.join(tempRoot, "bench.stl");
  await writeFile(modelPath, "solid bench\nendsolid bench");
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("launchSlicer", () => {
  it("returns a setup error when the executable path is missing", async () => {
    const result = await launchSlicer(slicer({ executablePath: "", enabled: true }), modelPath);

    expect(result).toEqual({
      ok: false,
      message: "Configure o caminho do executável do Cura antes de abrir modelos."
    });
  });

  it("returns an invalid path error when the executable does not exist", async () => {
    const result = await launchSlicer(
      slicer({ executablePath: path.join(tempRoot, "missing.exe"), enabled: true }),
      modelPath
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("não foi encontrado");
  });

  it("does not launch when a configured executable becomes stale", async () => {
    const stalePath = path.join(tempRoot, "stale.exe");
    await writeFile(stalePath, "stale executable");
    const spawnProcess = vi.fn();
    const resolveExecutable = vi.fn(async () => {
      throw new Error("stale executable");
    });

    const result = await launchSlicer(
      slicer({ executablePath: stalePath, enabled: true }),
      modelPath,
      spawnProcess,
      resolveExecutable
    );

    expect(result.ok).toBe(false);
    expect(resolveExecutable).toHaveBeenCalledWith(stalePath);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("spawns the slicer executable with the model path as one argument", async () => {
    const executablePath = path.join(tempRoot, "fake-slicer.exe");
    await writeFile(executablePath, "fake executable");
    const spawnProcess = vi.fn();

    const result = await launchSlicer(
      slicer({ executablePath, enabled: true }),
      modelPath,
      spawnProcess
    );

    expect(result).toEqual({
      ok: true,
      message: "Abrindo bench.stl no Cura."
    });
    expect(spawnProcess).toHaveBeenCalledWith(executablePath, [modelPath], {
      detached: true,
      stdio: "ignore"
    });
  });

  it("spawns the slicer executable with multiple model paths in one process", async () => {
    const executablePath = path.join(tempRoot, "fake-slicer.exe");
    const secondModelPath = path.join(tempRoot, "second.3mf");
    await writeFile(executablePath, "fake executable");
    await writeFile(secondModelPath, "3mf");
    const spawnProcess = vi.fn();

    const result = await launchSlicer(
      slicer({ executablePath, enabled: true }),
      [modelPath, secondModelPath],
      spawnProcess
    );

    expect(result).toEqual({
      ok: true,
      message: "Abrindo 2 modelos no Cura."
    });
    expect(spawnProcess).toHaveBeenCalledWith(executablePath, [modelPath, secondModelPath], {
      detached: true,
      stdio: "ignore"
    });
  });
});

function slicer(overrides: Partial<SlicerConfig>): SlicerConfig {
  return {
    id: "cura",
    name: "Cura",
    kind: "built-in",
    builtInKey: "cura",
    executablePath: "",
    enabled: false,
    pathSource: null,
    ...overrides
  };
}
