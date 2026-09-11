import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { unzipSync } from "fflate";
import type { ArchiveEntry, ArchiveListResult, FileOperationResult } from "../../src/shared/types.js";
import { isPathAtOrInside, isPathInside } from "./pathContainment.js";

const ARCHIVE_EXTENSIONS = new Set([".zip", ".rar", ".7z"]);
const PRINTABLE_EXTENSIONS = new Set([".stl", ".3mf"]);
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
  } catch {
    // ZIPs can still be handled without 7-Zip, but prefer 7-Zip when it is
    // available so large archives are listed without decompressing every entry.
  }

  try {
    const files = unzipSync(new Uint8Array(await readFile(safeArchivePath)));
    const entries = Object.entries(files)
      .map(([entryPath, bytes]) => createArchiveEntry(entryPath, bytes.length))
      .filter((entry): entry is ArchiveEntry => Boolean(entry))
      .sort((left, right) => left.path.localeCompare(right.path));

    return {
      ok: true,
      archivePath: safeArchivePath,
      entries
    };
  } catch {
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
  } catch {
    // Fall back to the built-in ZIP reader when 7-Zip is not installed or not configured.
  }

  let files: Record<string, Uint8Array>;

  try {
    files = unzipSync(new Uint8Array(await readFile(safeArchivePath)));
  } catch {
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

export function parseSevenZipListOutput(output: string): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let current: Record<string, string> = {};

  function flushCurrentEntry() {
    const entryPath = current.Path;

    if (!entryPath || current.Folder === "+") {
      current = {};
      return;
    }

    const sizeBytes = Number.parseInt(current.Size ?? "0", 10);
    const entry = createArchiveEntry(entryPath, Number.isFinite(sizeBytes) ? sizeBytes : 0);

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

  return {
    ok: true,
    archivePath,
    entries: parseSevenZipListOutput(output.stdout).sort((left, right) =>
      left.path.localeCompare(right.path)
    )
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

async function resolveSevenZipExecutable(configuredPath?: string): Promise<string> {
  const trimmedPath = configuredPath?.trim();

  if (trimmedPath) {
    if (await isExistingFile(trimmedPath)) {
      return trimmedPath;
    }

    throw new Error("O 7-Zip configurado nao foi encontrado. Confira o caminho nas configuracoes.");
  }

  const commonPaths = [
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe"
  ];

  for (const candidatePath of commonPaths) {
    if (await isExistingFile(candidatePath)) {
      return candidatePath;
    }
  }

  const pathCandidate = await findSevenZipOnPath();

  if (pathCandidate) {
    return pathCandidate;
  }

  throw new Error(
    "RAR e 7Z precisam do 7-Zip. Instale o 7-Zip ou configure o caminho do 7z.exe nas configuracoes."
  );
}

async function findSevenZipOnPath(): Promise<string | null> {
  const command = process.platform === "win32" ? "where.exe" : "which";
  const candidates = process.platform === "win32" ? ["7z.exe", "7zz.exe", "7za.exe"] : ["7z", "7zz", "7za"];

  for (const candidate of candidates) {
    try {
      const result = await execFileAsync(command, [candidate], { windowsHide: true });
      const firstPath = result.stdout.split(/\r?\n/).find(Boolean)?.trim();

      if (firstPath && (await isExistingFile(firstPath))) {
        return firstPath;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function isExistingFile(candidatePath: string): Promise<boolean> {
  try {
    const candidateStat = await stat(candidatePath);
    return candidateStat.isFile();
  } catch {
    return false;
  }
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

  if (!archiveStat.isFile() || !ARCHIVE_EXTENSIONS.has(extension)) {
    throw new Error("Arquivo compactado invalido.");
  }

  return normalizedArchivePath;
}

function createArchiveEntry(entryPath: string, sizeBytes: number): ArchiveEntry | null {
  const normalizedPath = normalizeArchiveEntryPath(entryPath);
  const extension = path.posix.extname(normalizedPath).toLowerCase();

  if (!PRINTABLE_EXTENSIONS.has(extension) || normalizedPath.endsWith("/")) {
    return null;
  }

  return {
    path: normalizedPath,
    name: path.posix.basename(normalizedPath),
    extension: extension as ArchiveEntry["extension"],
    sizeBytes
  };
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
