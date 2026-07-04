import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { SlicerConfig, SlicerLaunchResult } from "../../src/shared/types.js";

type SpawnProcess = typeof spawn;

export async function launchSlicer(
  slicer: SlicerConfig,
  modelPath: string,
  spawnProcess: SpawnProcess = spawn
): Promise<SlicerLaunchResult> {
  if (!slicer.enabled) {
    return {
      ok: false,
      message: `${slicer.name} está desativado nas configurações.`
    };
  }

  if (!slicer.executablePath) {
    return {
      ok: false,
      message: `Configure o caminho do executável do ${slicer.name} antes de abrir modelos.`
    };
  }

  const executableExists = await pathExists(slicer.executablePath);

  if (!executableExists) {
    return {
      ok: false,
      message: `O executável do ${slicer.name} não foi encontrado.`
    };
  }

  const modelExists = await pathExists(modelPath);

  if (!modelExists) {
    return {
      ok: false,
      message: "O modelo selecionado não foi encontrado."
    };
  }

  const child = spawnProcess(slicer.executablePath, [modelPath], {
    detached: true,
    stdio: "ignore"
  });

  child?.unref?.();

  return {
    ok: true,
    message: `Abrindo ${path.basename(modelPath)} no ${slicer.name}.`
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
