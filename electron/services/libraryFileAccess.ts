import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { isPathInside } from "./pathContainment.js";

type FileStat = {
  isFile(): boolean;
};

type LibraryFileAccessAdapters = {
  realpath(value: string): Promise<string>;
  stat(value: string): Promise<FileStat>;
};

const defaultAdapters: LibraryFileAccessAdapters = {
  realpath,
  stat
};

export async function resolveCanonicalLibraryFile(
  rootPath: string,
  candidatePath: string,
  adapters: LibraryFileAccessAdapters = defaultAdapters
): Promise<string> {
  if (
    typeof candidatePath !== "string" ||
    candidatePath.includes("\0") ||
    !path.isAbsolute(candidatePath)
  ) {
    throw new Error("Invalid library file path");
  }

  let canonicalRoot: string;
  let canonicalCandidate: string;

  try {
    [canonicalRoot, canonicalCandidate] = await Promise.all([
      adapters.realpath(rootPath),
      adapters.realpath(candidatePath)
    ]);
  } catch {
    throw new Error("Library file does not exist");
  }

  if (!isPathInside(canonicalRoot, canonicalCandidate)) {
    const candidateStat = await adapters.stat(canonicalCandidate);
    if (!candidateStat.isFile()) throw new Error("Library path is not a regular file");
    throw new Error("Library file is outside the library");
  }

  const candidateStat = await adapters.stat(canonicalCandidate);
  if (!candidateStat.isFile()) {
    throw new Error("Library path is not a regular file");
  }

  return canonicalCandidate;
}
