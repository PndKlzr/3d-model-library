import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileOperationResult, FileRestorePair } from "../../src/shared/types.js";

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

export async function trashModelFiles(
  rootPath: string,
  sourcePaths: string[],
  trashItem: (absolutePath: string) => Promise<void>
): Promise<FileOperationResult> {
  if (sourcePaths.length === 0) {
    return { ok: true, message: "Nenhum arquivo selecionado.", paths: [] };
  }

  const safeSourcePaths: string[] = [];

  for (const sourcePath of sourcePaths) {
    const safeSourcePath = resolveExistingAbsolutePath(rootPath, sourcePath);
    await assertModelFile(safeSourcePath);
    safeSourcePaths.push(safeSourcePath);
  }

  for (const safeSourcePath of safeSourcePaths) {
    await trashItem(safeSourcePath);
  }

  const count = safeSourcePaths.length;
  const noun = count === 1 ? "arquivo movido" : "arquivos movidos";
  return {
    ok: true,
    message: `${count} ${noun} para a Lixeira.`,
    paths: safeSourcePaths
  };
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

export async function moveLibraryFolder(
  rootPath: string,
  folderRelativePath: string,
  destinationRelativeFolder: string
): Promise<FileOperationResult> {
  if (!folderRelativePath) {
    throw new Error("A pasta raiz nao pode ser movida.");
  }

  const sourcePath = resolveLibraryPath(rootPath, folderRelativePath);
  await assertDirectory(sourcePath);

  const destinationFolder = resolveLibraryPath(rootPath, destinationRelativeFolder);
  await assertDirectory(destinationFolder);

  if (isSameOrInside(sourcePath, destinationFolder)) {
    throw new Error("Nao e possivel mover uma pasta para dentro dela mesma.");
  }

  const destinationPath = path.join(destinationFolder, path.basename(sourcePath));

  if (!samePath(sourcePath, destinationPath)) {
    await assertAvailable(destinationPath, "Ja existe uma pasta com esse nome no destino.");
    await rename(sourcePath, destinationPath);
  }

  return {
    ok: true,
    message: samePath(sourcePath, destinationPath) ? "Pasta ja estava nesse destino." : "Pasta movida.",
    path: destinationPath
  };
}

export async function trashLibraryFolder(
  rootPath: string,
  folderRelativePath: string,
  trashItem: (absolutePath: string) => Promise<void>
): Promise<FileOperationResult> {
  if (!folderRelativePath) {
    throw new Error("A pasta raiz nao pode ir para a Lixeira.");
  }

  const sourcePath = resolveLibraryPath(rootPath, folderRelativePath);
  await assertDirectory(sourcePath);
  await trashItem(sourcePath);

  return { ok: true, message: "Pasta movida para a Lixeira.", path: sourcePath };
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

export async function saveConvertedStlFile(
  rootPath: string,
  sourcePath: string,
  stlContent: string
): Promise<FileOperationResult> {
  const safeSourcePath = resolveExistingAbsolutePath(rootPath, sourcePath);

  if (path.extname(safeSourcePath).toLowerCase() !== ".3mf") {
    throw new Error("Apenas arquivos 3MF podem ser convertidos para STL.");
  }

  const sourceStat = await stat(safeSourcePath);

  if (!sourceStat.isFile()) {
    throw new Error("Arquivo de origem invalido.");
  }

  const destinationPath = path.join(
    path.dirname(safeSourcePath),
    `${path.basename(safeSourcePath, path.extname(safeSourcePath))}.stl`
  );
  await assertAvailable(destinationPath, "Ja existe um STL com esse nome.");
  await writeFile(destinationPath, stlContent);

  return {
    ok: true,
    message: "STL convertido salvo.",
    path: destinationPath,
    paths: [destinationPath]
  };
}

export async function restoreLibraryPaths(
  rootPath: string,
  pathPairs: FileRestorePair[]
): Promise<FileOperationResult> {
  if (pathPairs.length === 0) {
    return { ok: true, message: "Nada para desfazer.", paths: [] };
  }

  const safePairs: FileRestorePair[] = [];
  const destinationPaths = new Set<string>();

  for (const pair of pathPairs) {
    const safeSourcePath = resolveExistingAbsolutePath(rootPath, pair.sourcePath);
    const safeDestinationPath = resolveAbsolutePathInsideLibrary(rootPath, pair.destinationPath);

    await assertAvailable(
      safeDestinationPath,
      "Ja existe um arquivo ou pasta no caminho de restauracao."
    );

    const destinationKey = path.resolve(safeDestinationPath).toLowerCase();

    if (destinationPaths.has(destinationKey)) {
      throw new Error("Mais de um item seria restaurado para o mesmo caminho.");
    }

    destinationPaths.add(destinationKey);
    safePairs.push({ sourcePath: safeSourcePath, destinationPath: safeDestinationPath });
  }

  for (const pair of safePairs) {
    await rename(pair.sourcePath, pair.destinationPath);
  }

  return {
    ok: true,
    message: "Acao desfeita.",
    paths: safePairs.map((pair) => pair.destinationPath)
  };
}

function resolveLibraryPath(rootPath: string, relativePath: string): string {
  const normalizedRoot = path.resolve(rootPath);
  const destinationPath = path.resolve(normalizedRoot, normalizeRelativeFolder(relativePath));
  assertInsideRoot(normalizedRoot, destinationPath, true);
  return destinationPath;
}

function resolveAbsolutePathInsideLibrary(rootPath: string, absolutePath: string): string {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedPath = path.resolve(absolutePath);
  assertInsideRoot(normalizedRoot, normalizedPath, false);
  return normalizedPath;
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

function isSameOrInside(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
