import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { SlicerConfig } from "../../src/shared/types.js";

type SlicerExecutableAdapters = {
  lstat: typeof lstat;
  realpath: typeof realpath;
  stat: typeof stat;
};

const defaultAdapters: SlicerExecutableAdapters = { lstat, realpath, stat };

export async function resolveSlicerExecutable(
  candidatePath: string,
  adapters: SlicerExecutableAdapters = defaultAdapters
): Promise<string> {
  if (
    typeof candidatePath !== "string"
    || candidatePath.includes("\0")
    || !path.isAbsolute(candidatePath)
    || path.extname(candidatePath).toLowerCase() !== ".exe"
  ) {
    throw new Error("Caminho de executável inválido.");
  }

  const selectedStat = await adapters.lstat(candidatePath);
  if (!selectedStat.isFile() || selectedStat.isSymbolicLink()) {
    throw new Error("O executável selecionado não é um arquivo regular.");
  }

  const canonicalPath = await adapters.realpath(candidatePath);
  const canonicalStat = await adapters.stat(canonicalPath);
  if (!canonicalStat.isFile() || path.extname(canonicalPath).toLowerCase() !== ".exe") {
    throw new Error("O executável selecionado não é válido.");
  }

  return canonicalPath;
}

export async function inspectConfiguredSlicers(
  slicers: readonly Pick<SlicerConfig, "id" | "executablePath">[]
): Promise<string[]> {
  const results = await Promise.all(slicers.filter((slicer) => slicer.executablePath).map(async (slicer) => {
    try {
      await resolveSlicerExecutable(slicer.executablePath);
      return null;
    } catch {
      return slicer.id;
    }
  }));
  return results.filter((id): id is string => id !== null);
}
