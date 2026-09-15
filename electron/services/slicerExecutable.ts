import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";

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
