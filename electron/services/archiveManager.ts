import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import type { ArchiveEntry, ArchiveListResult, FileOperationResult } from "../../src/shared/types.js";

const ARCHIVE_EXTENSIONS = new Set([".zip", ".rar", ".7z"]);
const PRINTABLE_EXTENSIONS = new Set([".stl", ".3mf"]);

export async function listArchiveEntries(
  rootPath: string,
  archivePath: string
): Promise<ArchiveListResult> {
  const safeArchivePath = await resolveArchivePath(rootPath, archivePath);
  const extension = path.extname(safeArchivePath).toLowerCase();

  if (extension !== ".zip") {
    throw new Error("RAR e 7Z precisam do 7-Zip configurado. ZIP ja funciona embutido.");
  }

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
}

export async function extractArchiveEntries(
  rootPath: string,
  archivePath: string,
  entryPaths: string[],
  destinationRelativeFolder?: string
): Promise<FileOperationResult> {
  const safeArchivePath = await resolveArchivePath(rootPath, archivePath);
  const extension = path.extname(safeArchivePath).toLowerCase();

  if (extension !== ".zip") {
    throw new Error("RAR e 7Z precisam do 7-Zip configurado. ZIP ja funciona embutido.");
  }

  if (entryPaths.length === 0) {
    return { ok: true, message: "Nenhum arquivo selecionado.", paths: [] };
  }

  const files = unzipSync(new Uint8Array(await readFile(safeArchivePath)));
  const selectedPaths = new Set(entryPaths.map(normalizeArchiveEntryPath));
  const destinationRoot = resolveExtractionRoot(rootPath, safeArchivePath, destinationRelativeFolder);
  const extractedPaths: string[] = [];

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

  return relativeFolder.split(/[\\/]+/).filter(Boolean).join(path.sep);
}

function assertInsideRoot(rootPath: string, candidatePath: string, allowRoot: boolean) {
  const relativePath = path.relative(rootPath, candidatePath);
  const isRoot = relativePath === "";
  const isOutside = relativePath.startsWith("..") || path.isAbsolute(relativePath);

  if (isOutside || (!allowRoot && isRoot)) {
    throw new Error("Caminho fora da biblioteca.");
  }
}
