import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { SlicerConfig, SlicerLaunchResult } from "../../src/shared/types.js";
import { resolveSlicerExecutable } from "./slicerExecutable.js";

type SpawnProcess = typeof spawn;
type ResolveExecutable = (candidatePath: string) => Promise<string>;

export async function launchSlicer(
  slicer: SlicerConfig,
  modelPaths: string | string[],
  spawnProcess: SpawnProcess = spawn,
  resolveExecutable: ResolveExecutable = resolveSlicerExecutable
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

  let executablePath: string;
  try {
    executablePath = await resolveExecutable(slicer.executablePath);
  } catch {
    return {
      ok: false,
      message: `O executável do ${slicer.name} não foi encontrado.`
    };
  }

  const launchPaths = Array.isArray(modelPaths) ? modelPaths : [modelPaths];

  if (launchPaths.length === 0) {
    return {
      ok: false,
      message: "Selecione pelo menos um modelo para abrir no slicer."
    };
  }

  const modelExists = await Promise.all(launchPaths.map((modelPath) => pathExists(modelPath)));

  if (modelExists.some((exists) => !exists)) {
    return {
      ok: false,
      message: "O modelo selecionado não foi encontrado."
    };
  }

  const child = spawnProcess(executablePath, launchPaths, {
    detached: true,
    stdio: "ignore"
  });

  child?.unref?.();

  return {
    ok: true,
    message:
      launchPaths.length === 1
        ? `Abrindo ${path.basename(launchPaths[0])} no ${slicer.name}.`
        : `Abrindo ${launchPaths.length} modelos no ${slicer.name}.`
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
