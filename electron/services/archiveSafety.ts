import { execFile } from "node:child_process";
import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ArchiveLimits = Readonly<{
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
}>;

export const BUILTIN_ARCHIVE_LIMITS: ArchiveLimits = Object.freeze({
  maxEntries: 10_000,
  maxEntryBytes: 256 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024
});

export const SEVEN_ZIP_ARCHIVE_LIMITS: ArchiveLimits = Object.freeze({
  maxEntries: 20_000,
  maxEntryBytes: 8 * 1024 * 1024 * 1024,
  maxTotalBytes: 16 * 1024 * 1024 * 1024
});

export const BUILTIN_MAX_COMPRESSED_BYTES = 256 * 1024 * 1024;

type ArchiveSizeEntry = {
  path: string;
  sizeBytes: number;
};

type FileStat = {
  isFile(): boolean;
};

type FileLstat = FileStat & {
  isSymbolicLink(): boolean;
};

type SevenZipAdapters = {
  lstat(value: string): Promise<FileLstat>;
  realpath(value: string): Promise<string>;
  stat(value: string): Promise<FileStat>;
  findOnPath(): Promise<string | null>;
};

export class ArchiveSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveSafetyError";
  }
}

export function validateArchiveEntries(
  entries: ArchiveSizeEntry[],
  limits: ArchiveLimits
): void {
  const validateEntry = createArchiveEntryValidator(limits);
  for (const entry of entries) {
    validateEntry(entry);
  }
}

export function createArchiveEntryValidator(limits: ArchiveLimits) {
  let entryCount = 0;
  let totalBytes = 0;

  return (entry: ArchiveSizeEntry): void => {
    entryCount += 1;
    if (entryCount > limits.maxEntries) {
      throw new ArchiveSafetyError("Archive has too many entries to process safely.");
    }
    if (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0) {
      throw new ArchiveSafetyError(`Archive has an invalid entry size: ${entry.path}`);
    }
    if (entry.sizeBytes > limits.maxEntryBytes) {
      throw new ArchiveSafetyError(`Archive entry is too large to process safely: ${entry.path}`);
    }
    if (totalBytes > Number.MAX_SAFE_INTEGER - entry.sizeBytes) {
      throw new ArchiveSafetyError("Archive expanded content is too large to process safely.");
    }

    totalBytes += entry.sizeBytes;
    if (totalBytes > limits.maxTotalBytes) {
      throw new ArchiveSafetyError("Archive expanded content is too large to process safely.");
    }
  };
}

const defaultSevenZipAdapters: SevenZipAdapters = {
  lstat,
  realpath,
  stat,
  findOnPath: findSevenZipOnPath
};

export async function resolveSevenZipExecutable(
  configuredPath?: string,
  adapters: SevenZipAdapters = defaultSevenZipAdapters
): Promise<string> {
  const trimmedPath = configuredPath?.trim();

  if (trimmedPath) {
    return validateSevenZipExecutable(trimmedPath, adapters);
  }

  const commonPaths = [
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe"
  ];

  for (const candidatePath of commonPaths) {
    try {
      return await validateSevenZipExecutable(candidatePath, adapters);
    } catch {
      continue;
    }
  }

  const pathCandidate = await adapters.findOnPath();
  if (pathCandidate) {
    return validateSevenZipExecutable(pathCandidate, adapters);
  }

  throw new Error(
    "RAR e 7Z precisam do 7-Zip. Instale o 7-Zip ou configure o caminho do 7z.exe nas configuracoes."
  );
}

async function validateSevenZipExecutable(
  candidatePath: string,
  adapters: SevenZipAdapters
): Promise<string> {
  if (!path.isAbsolute(candidatePath)) {
    throw new Error("Configure an absolute 7-Zip path.");
  }

  let linkStat: FileLstat;
  try {
    linkStat = await adapters.lstat(candidatePath);
  } catch {
    throw new Error("O 7-Zip configurado nao foi encontrado. Confira o caminho nas configuracoes.");
  }

  if (linkStat.isSymbolicLink()) {
    throw new Error("The configured 7-Zip executable cannot be a symbolic link.");
  }
  if (!linkStat.isFile()) {
    throw new Error("Configure a regular 7-Zip executable file.");
  }

  const canonicalPath = await adapters.realpath(candidatePath);
  const canonicalStat = await adapters.stat(canonicalPath);
  if (!canonicalStat.isFile()) {
    throw new Error("Configure a regular 7-Zip executable file.");
  }

  const executableName = path.basename(canonicalPath).toLowerCase();
  if (!["7z.exe", "7zz.exe", "7za.exe"].includes(executableName)) {
    throw new Error("The extractor must be 7z.exe, 7zz.exe, or 7za.exe.");
  }

  return canonicalPath;
}

async function findSevenZipOnPath(): Promise<string | null> {
  if (process.platform !== "win32") return null;

  for (const candidate of ["7z.exe", "7zz.exe", "7za.exe"]) {
    try {
      const result = await execFileAsync("where.exe", [candidate], { windowsHide: true });
      const firstPath = result.stdout.split(/\r?\n/).find(Boolean)?.trim();
      if (firstPath) return firstPath;
    } catch {
      continue;
    }
  }

  return null;
}
