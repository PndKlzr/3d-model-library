import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { unzip } from "fflate";
import type {
  ArchiveEntry,
  ArchiveExtractionMode,
  ArchiveListResult,
  FileOperationResult
} from "../../src/shared/types.js";
import {
  isArchive,
  toSupportedFileExtension
} from "../../src/shared/fileCapabilities.js";
import { isPathAtOrInside, isPathInside } from "./pathContainment.js";
import {
  ArchiveSafetyError,
  BUILTIN_ARCHIVE_LIMITS,
  BUILTIN_MAX_COMPRESSED_BYTES,
  createArchiveEntryValidator,
  resolveSevenZipExecutable,
  SEVEN_ZIP_ARCHIVE_LIMITS,
  validateArchiveEntries
} from "./archiveSafety.js";

const execFileAsync = promisify(execFile);

type SevenZipRunResult = {
  stdout: string;
  stderr: string;
};

type ArchiveToolOptions = {
  extractorPath?: string;
  runSevenZip?: (args: string[], executablePath: string) => Promise<SevenZipRunResult>;
};

export async function listArchiveEntries(
  rootPath: string,
  archivePath: string,
  options: ArchiveToolOptions = {}
): Promise<ArchiveListResult> {
  const safeArchivePath = await resolveArchivePath(rootPath, archivePath);
  const extension = path.extname(safeArchivePath).toLowerCase();

  if (extension !== ".zip") {
    return listWithSevenZip(safeArchivePath, options);
  }

  try {
    return await listWithSevenZip(safeArchivePath, options);
  } catch (error) {
    if (error instanceof ArchiveSafetyError) throw error;
    // ZIPs can still be handled without 7-Zip, but prefer 7-Zip when it is
    // available so large archives are listed without decompressing every entry.
  }

  try {
    const files = await unzipBounded(safeArchivePath);
    const entries = Object.entries(files)
      .map(([entryPath, bytes]) => createArchiveEntry(entryPath, bytes.length))
      .filter((entry): entry is ArchiveEntry => Boolean(entry))
      .sort((left, right) => left.path.localeCompare(right.path));

    return {
      ok: true,
      archivePath: safeArchivePath,
      entries
    };
  } catch (error) {
    if (error instanceof ArchiveSafetyError) throw error;
    return listWithSevenZip(safeArchivePath, options);
  }
}

export async function extractArchiveEntries(
  rootPath: string,
  archivePath: string,
  entryPaths: string[],
  destinationRelativeFolder?: string,
  options: ArchiveToolOptions = {}
): Promise<FileOperationResult> {
  const safeArchivePath = await resolveArchivePath(rootPath, archivePath);
  const extension = path.extname(safeArchivePath).toLowerCase();

  if (entryPaths.length === 0) {
    return { ok: true, message: "Nenhum arquivo selecionado.", paths: [] };
  }

  if (extension !== ".zip") {
    return extractWithSevenZip(rootPath, safeArchivePath, entryPaths, destinationRelativeFolder, options);
  }

  try {
    return await extractWithSevenZip(
      rootPath,
      safeArchivePath,
      entryPaths,
      destinationRelativeFolder,
      options
    );
  } catch (error) {
    if (error instanceof ArchiveSafetyError) throw error;
    // Fall back to the built-in ZIP reader when 7-Zip is not installed or not configured.
  }

  let files: Record<string, Uint8Array>;

  try {
    files = await unzipBounded(
      safeArchivePath,
      new Set(entryPaths.map(normalizeArchiveEntryPath))
    );
  } catch (error) {
    if (error instanceof ArchiveSafetyError) throw error;
    return extractWithSevenZip(rootPath, safeArchivePath, entryPaths, destinationRelativeFolder, options);
  }

  const selectedPaths = new Set(entryPaths.map(normalizeArchiveEntryPath));
  const destinationRoot = resolveExtractionRoot(rootPath, safeArchivePath, destinationRelativeFolder);
  const extractedPaths: string[] = [];
  const pendingWrites: Array<{ destinationPath: string; bytes: Uint8Array }> = [];
  const pendingDestinationKeys = new Set<string>();

  for (const [entryPath, bytes] of Object.entries(files)) {
    const normalizedEntryPath = normalizeArchiveEntryPath(entryPath);

    if (!selectedPaths.has(normalizedEntryPath)) {
      continue;
    }

    const entry = createArchiveEntry(normalizedEntryPath, bytes.length);

    if (!entry) {
      continue;
    }

    const destinationPath = resolveEntryDestination(destinationRoot, normalizedEntryPath);
    assertUniqueExtractionDestination(destinationPath, pendingDestinationKeys);
    await assertAvailableExtractionDestination(destinationPath);
    pendingWrites.push({ destinationPath, bytes });
  }

  for (const { destinationPath, bytes } of pendingWrites) {
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, bytes);
    extractedPaths.push(destinationPath);
  }

  const count = extractedPaths.length;
  const noun = count === 1 ? "arquivo extraido" : "arquivos extraidos";
  return {
    ok: true,
    message: count === 0 ? "Nenhum arquivo extraido." : `${count} ${noun}.`,
    paths: extractedPaths
  };
}

export async function extractArchive(
  rootPath: string,
  archivePath: string,
  mode: ArchiveExtractionMode,
  options: ArchiveToolOptions = {}
): Promise<FileOperationResult> {
  if (mode !== "here" && mode !== "named-folder") {
    throw new Error("Modo de extracao invalido.");
  }

  const safeArchivePath = await resolveArchivePath(rootPath, archivePath);
  const listing = await listArchiveEntries(rootPath, safeArchivePath, options);
  const fileEntries = listing.entries.filter((entry) => !entry.isDirectory);
  const archiveFolder = path.dirname(safeArchivePath);
  const archiveBaseName = path.basename(safeArchivePath, path.extname(safeArchivePath));
  const parentRelativeFolder = path.relative(path.resolve(rootPath), archiveFolder);
  const hasRedundantRoot = mode === "named-folder" &&
    entriesShareRoot(fileEntries, archiveBaseName);
  const destinationRelativeFolder = mode === "here" || hasRedundantRoot
    ? parentRelativeFolder
    : path.join(parentRelativeFolder, archiveBaseName);
  const result = await extractArchiveEntries(
    rootPath,
    safeArchivePath,
    fileEntries.map((entry) => entry.path),
    destinationRelativeFolder,
    options
  );

  return {
    ...result,
    path: mode === "named-folder"
      ? path.join(archiveFolder, archiveBaseName)
      : archiveFolder
  };
}

export function parseSevenZipListOutput(output: string): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let current: Record<string, string> = {};

  function flushCurrentEntry() {
    const entryPath = current.Path;

    if (!entryPath || (current.Folder !== "+" && current.Folder !== "-")) {
      current = {};
      return;
    }

    const sizeBytes = Number.parseInt(current.Size ?? "", 10);
    const entry = createArchiveEntry(
      entryPath,
      sizeBytes,
      current.Folder === "+"
    );

    if (entry) {
      entries.push(entry);
    }

    current = {};
  }

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      flushCurrentEntry();
      continue;
    }

    const separatorIndex = line.indexOf(" = ");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 3);

    if (key === "Path" || key === "Size" || key === "Folder") {
      current[key] = value;
    }
  }

  flushCurrentEntry();
  return entries;
}

async function listWithSevenZip(
  archivePath: string,
  options: ArchiveToolOptions
): Promise<ArchiveListResult> {
  const output = await runSevenZipCommand(["l", "-slt", archivePath], options);
  const entries = parseSevenZipListOutput(output.stdout).sort((left, right) =>
    left.path.localeCompare(right.path)
  );
  validateArchiveEntries(entries, SEVEN_ZIP_ARCHIVE_LIMITS);

  return {
    ok: true,
    archivePath,
    entries
  };
}

async function extractWithSevenZip(
  rootPath: string,
  archivePath: string,
  entryPaths: string[],
  destinationRelativeFolder: string | undefined,
  options: ArchiveToolOptions
): Promise<FileOperationResult> {
  const normalizedEntries = entryPaths.map(normalizeArchiveEntryPath);
  await listWithSevenZip(archivePath, options);
  const destinationRoot = resolveExtractionRoot(rootPath, archivePath, destinationRelativeFolder);
  const extractedPaths: string[] = [];

  for (const entryPath of normalizedEntries) {
    const entry = createArchiveEntry(entryPath, 0);

    if (!entry) {
      continue;
    }

    extractedPaths.push(resolveEntryDestination(destinationRoot, entry.path));
  }

  if (extractedPaths.length === 0) {
    return { ok: true, message: "Nenhum arquivo extraido.", paths: [] };
  }

  assertUniqueExtractionDestinations(extractedPaths);

  for (const extractedPath of extractedPaths) {
    await assertAvailableExtractionDestination(extractedPath);
  }

  await mkdir(destinationRoot, { recursive: true });
  await runSevenZipCommand(["x", archivePath, `-o${destinationRoot}`, "-y", ...normalizedEntries], options);

  const count = extractedPaths.length;
  const noun = count === 1 ? "arquivo extraido" : "arquivos extraidos";
  return {
    ok: true,
    message: `${count} ${noun}.`,
    paths: extractedPaths
  };
}

async function runSevenZipCommand(
  args: string[],
  options: ArchiveToolOptions
): Promise<SevenZipRunResult> {
  const executablePath = await resolveSevenZipExecutable(options.extractorPath);

  try {
    if (options.runSevenZip) {
      return await options.runSevenZip(args, executablePath);
    }

    const result = await execFileAsync(executablePath, args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 20
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const partialOutput = getPartialSevenZipOutput(error);

    if (args[0] === "l" && partialOutput?.stdout) {
      return partialOutput;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`7-Zip nao conseguiu abrir o arquivo compactado. ${message}`);
  }
}

function getPartialSevenZipOutput(error: unknown): SevenZipRunResult | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const maybeOutput = error as { stdout?: unknown; stderr?: unknown };
  const stdout = outputToString(maybeOutput.stdout);
  const stderr = outputToString(maybeOutput.stderr);

  if (!stdout && !stderr) {
    return null;
  }

  return { stdout, stderr };
}

function outputToString(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }

  if (Buffer.isBuffer(output)) {
    return output.toString("utf8");
  }

  return "";
}

async function unzipBounded(
  archivePath: string,
  selectedPaths?: Set<string>
): Promise<Record<string, Uint8Array>> {
  const archiveStat = await stat(archivePath);
  if (!Number.isSafeInteger(archiveStat.size) || archiveStat.size > BUILTIN_MAX_COMPRESSED_BYTES) {
    throw new ArchiveSafetyError("Archive file is too large for the built-in ZIP reader.");
  }

  const bytes = new Uint8Array(await readFile(archivePath));
  const validateEntry = createArchiveEntryValidator(BUILTIN_ARCHIVE_LIMITS);

  return new Promise((resolve, reject) => {
    let settled = false;

    try {
      unzip(bytes, {
        filter: (file) => {
          try {
            validateEntry({ path: file.name, sizeBytes: file.originalSize });
            return !selectedPaths || selectedPaths.has(normalizeArchiveEntryPath(file.name));
          } catch (error) {
            settled = true;
            reject(error);
            return false;
          }
        }
      }, (error, files) => {
        if (settled) return;
        settled = true;
        if (error) {
          reject(error);
        } else {
          resolve(files);
        }
      });
    } catch (error) {
      if (!settled) {
        settled = true;
        reject(error);
      }
    }
  });
}

async function assertAvailableExtractionDestination(destinationPath: string): Promise<void> {
  try {
    await stat(destinationPath);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    throw error;
  }

  throw new Error("Ja existe um arquivo extraido com esse nome.");
}

function assertUniqueExtractionDestinations(destinationPaths: string[]): void {
  const seenDestinationKeys = new Set<string>();

  for (const destinationPath of destinationPaths) {
    assertUniqueExtractionDestination(destinationPath, seenDestinationKeys);
  }
}

function assertUniqueExtractionDestination(
  destinationPath: string,
  seenDestinationKeys: Set<string>
): void {
  const destinationKey = path.resolve(destinationPath).toLowerCase();

  if (seenDestinationKeys.has(destinationKey)) {
    throw new Error("Mais de uma entrada extrairia para o mesmo caminho.");
  }

  seenDestinationKeys.add(destinationKey);
}

async function resolveArchivePath(rootPath: string, archivePath: string): Promise<string> {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedArchivePath = path.resolve(archivePath);
  assertInsideRoot(normalizedRoot, normalizedArchivePath, false);
  const archiveStat = await stat(normalizedArchivePath);
  const extension = path.extname(normalizedArchivePath).toLowerCase();

  const supportedExtension = toSupportedFileExtension(extension);
  if (!archiveStat.isFile() || !supportedExtension || !isArchive(supportedExtension)) {
    throw new Error("Arquivo compactado invalido.");
  }

  return normalizedArchivePath;
}

function createArchiveEntry(
  entryPath: string,
  sizeBytes: number,
  isDirectory = entryPath.endsWith("/") || entryPath.endsWith("\\")
): ArchiveEntry | null {
  const normalizedPath = normalizeArchiveEntryPath(entryPath);
  const entryName = path.posix.basename(normalizedPath.replace(/\/$/, ""));
  if (!normalizedPath || !entryName) return null;

  return {
    path: normalizedPath,
    name: entryName,
    extension: isDirectory ? "" : path.posix.extname(normalizedPath).toLowerCase(),
    sizeBytes,
    ...(isDirectory ? { isDirectory: true } : {})
  };
}

function entriesShareRoot(entries: ArchiveEntry[], rootName: string): boolean {
  if (entries.length === 0) return false;
  const expected = rootName.toLocaleLowerCase();
  return entries.every((entry) => {
    const segments = normalizeArchiveEntryPath(entry.path).split("/").filter(Boolean);
    return segments.length > 1 && segments[0].toLocaleLowerCase() === expected;
  });
}

function resolveExtractionRoot(
  rootPath: string,
  archivePath: string,
  destinationRelativeFolder: string | undefined
): string {
  const normalizedRoot = path.resolve(rootPath);
  const archiveBaseName = path.basename(archivePath, path.extname(archivePath));
  const defaultRelativeFolder = path.join(path.relative(rootPath, path.dirname(archivePath)), archiveBaseName);
  const destinationPath = path.resolve(
    normalizedRoot,
    normalizeRelativeFolder(destinationRelativeFolder ?? defaultRelativeFolder)
  );
  assertInsideRoot(normalizedRoot, destinationPath, true);
  return destinationPath;
}

function resolveEntryDestination(destinationRoot: string, entryPath: string): string {
  const normalizedEntryPath = normalizeArchiveEntryPath(entryPath);

  if (normalizedEntryPath.startsWith("../") || normalizedEntryPath.includes("/../")) {
    throw new Error("Entrada insegura no arquivo compactado.");
  }

  const destinationPath = path.resolve(destinationRoot, ...normalizedEntryPath.split("/"));
  assertInsideRoot(destinationRoot, destinationPath, false);
  return destinationPath;
}

function normalizeArchiveEntryPath(entryPath: string): string {
  return entryPath.replaceAll("\\", "/").replace(/^\/+/, "");
}

function normalizeRelativeFolder(relativeFolder: string): string {
  if (!relativeFolder || relativeFolder === ".") {
    return "";
  }

  const parts = relativeFolder.split(/[\\/]+/).filter(Boolean);

  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error("Pasta de destino invalida.");
  }

  return parts.join(path.sep);
}

function assertInsideRoot(rootPath: string, candidatePath: string, allowRoot: boolean) {
  const isAllowed = allowRoot
    ? isPathAtOrInside(rootPath, candidatePath)
    : isPathInside(rootPath, candidatePath);

  if (!isAllowed) {
    throw new Error("Caminho fora da biblioteca.");
  }
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
