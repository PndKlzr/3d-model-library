import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import type { FileOperationResult } from "../../src/shared/types.js";

const MODEL_EXTENSIONS = new Set([".stl", ".3mf"]);
const INVALID_WINDOWS_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED_WINDOWS_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9"
]);

export async function createLibraryFolder(
  rootPath: string,
  parentRelativeFolder: string,
  folderName: string
): Promise<FileOperationResult> {
  const safeName = validateSingleName(folderName);
  const parentPath = resolveLibraryPath(rootPath, parentRelativeFolder);
  await assertDirectory(parentPath);

  const destinationPath = resolveLibraryPath(rootPath, path.join(parentRelativeFolder, safeName));
  await assertAvailable(destinationPath, "Ja existe uma pasta com esse nome.");
  await mkdir(destinationPath);

  return { ok: true, message: "Pasta criada.", path: destinationPath };
}

export async function moveModelFiles(
  rootPath: string,
  sourcePaths: string[],
  destinationRelativeFolder: string
): Promise<FileOperationResult> {
  if (sourcePaths.length === 0) {
    return { ok: true, message: "Nenhum arquivo selecionado." };
  }

  const destinationFolder = resolveLibraryPath(rootPath, destinationRelativeFolder);
  await assertDirectory(destinationFolder);

  const moves = [];
  const destinationPaths = new Set<string>();

  for (const sourcePath of sourcePaths) {
    const safeSourcePath = resolveExistingAbsolutePath(rootPath, sourcePath);
    await assertModelFile(safeSourcePath);

    const destinationPath = path.join(destinationFolder, path.basename(safeSourcePath));

    if (samePath(safeSourcePath, destinationPath)) {
      continue;
    }

    await assertAvailable(destinationPath, "Ja existe um arquivo com esse nome na pasta destino.");
    const destinationKey = path.resolve(destinationPath).toLowerCase();

    if (destinationPaths.has(destinationKey)) {
      throw new Error("Mais de um arquivo selecionado tem o mesmo nome.");
    }

    destinationPaths.add(destinationKey);
    moves.push({ sourcePath: safeSourcePath, destinationPath });
  }

  for (const move of moves) {
    await rename(move.sourcePath, move.destinationPath);
  }

  const count = moves.length;
  const noun = count === 1 ? "arquivo movido" : "arquivos movidos";
  return { ok: true, message: count === 0 ? "Arquivo ja estava nessa pasta." : `${count} ${noun}.` };
}

export async function renameLibraryFolder(
  rootPath: string,
  folderRelativePath: string,
  newName: string
): Promise<FileOperationResult> {
  if (!folderRelativePath) {
    throw new Error("A pasta raiz nao pode ser renomeada.");
  }

  const safeName = validateSingleName(newName);
  const sourcePath = resolveLibraryPath(rootPath, folderRelativePath);
  await assertDirectory(sourcePath);

  const parentRelativePath = normalizeRelativeFolder(path.dirname(folderRelativePath));
  const destinationPath = resolveLibraryPath(rootPath, path.join(parentRelativePath, safeName));

  if (!samePath(sourcePath, destinationPath)) {
    await assertAvailable(destinationPath, "Ja existe uma pasta com esse nome.");
    await rename(sourcePath, destinationPath);
  }

  return { ok: true, message: "Pasta renomeada.", path: destinationPath };
}

export async function renameModelFile(
  rootPath: string,
  sourcePath: string,
  newName: string
): Promise<FileOperationResult> {
  const safeSourcePath = resolveExistingAbsolutePath(rootPath, sourcePath);
  await assertModelFile(safeSourcePath);

  const extension = path.extname(safeSourcePath).toLowerCase();
  const safeFileName = validateModelFileName(newName, extension);
  const destinationPath = path.join(path.dirname(safeSourcePath), safeFileName);

  if (!samePath(safeSourcePath, destinationPath)) {
    await assertAvailable(destinationPath, "Ja existe um arquivo com esse nome.");
    await rename(safeSourcePath, destinationPath);
  }

  return { ok: true, message: "Arquivo renomeado.", path: destinationPath };
}

function resolveLibraryPath(rootPath: string, relativePath: string): string {
  const normalizedRoot = path.resolve(rootPath);
  const destinationPath = path.resolve(normalizedRoot, normalizeRelativeFolder(relativePath));
  assertInsideRoot(normalizedRoot, destinationPath, true);
  return destinationPath;
}

function resolveExistingAbsolutePath(rootPath: string, absolutePath: string): string {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedPath = path.resolve(absolutePath);
  assertInsideRoot(normalizedRoot, normalizedPath, false);
  return normalizedPath;
}

function assertInsideRoot(rootPath: string, candidatePath: string, allowRoot: boolean) {
  const relativePath = path.relative(rootPath, candidatePath);
  const isRoot = relativePath === "";
  const isOutside = relativePath.startsWith("..") || path.isAbsolute(relativePath);

  if (isOutside || (!allowRoot && isRoot)) {
    throw new Error("Caminho fora da biblioteca.");
  }
}

function validateSingleName(name: string): string {
  const trimmed = name.trim();

  if (
    !trimmed ||
    trimmed.endsWith(".") ||
    trimmed.endsWith(" ") ||
    INVALID_WINDOWS_NAME_CHARS.test(trimmed) ||
    RESERVED_WINDOWS_NAMES.has(trimmed.split(".")[0].toLowerCase())
  ) {
    throw new Error("Nome invalido.");
  }

  return trimmed;
}

function validateModelFileName(name: string, requiredExtension: string): string {
  const trimmed = validateSingleName(name);
  const extension = path.extname(trimmed).toLowerCase();
  const baseName = extension ? path.basename(trimmed, extension) : trimmed;

  if (!baseName.trim()) {
    throw new Error("Nome invalido.");
  }

  if (extension && extension !== requiredExtension) {
    throw new Error(`Mantenha a extensao ${requiredExtension}.`);
  }

  return extension ? trimmed : `${trimmed}${requiredExtension}`;
}

function normalizeRelativeFolder(relativeFolder: string): string {
  if (!relativeFolder || relativeFolder === ".") {
    return "";
  }

  const parts = relativeFolder.split(/[\\/]+/).filter(Boolean);

  for (const part of parts) {
    validateSingleName(part);
  }

  return parts.join(path.sep);
}

async function assertDirectory(directoryPath: string) {
  const directoryStat = await stat(directoryPath);

  if (!directoryStat.isDirectory()) {
    throw new Error("Destino nao e uma pasta.");
  }
}

async function assertModelFile(filePath: string) {
  const fileStat = await stat(filePath);
  const extension = path.extname(filePath).toLowerCase();

  if (!fileStat.isFile() || !MODEL_EXTENSIONS.has(extension)) {
    throw new Error("Arquivo de modelo invalido.");
  }
}

async function assertAvailable(candidatePath: string, message: string) {
  try {
    await stat(candidatePath);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    throw error;
  }

  throw new Error(message);
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
