import { statSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const PRINTABLE_FILE_EXTENSIONS = new Set([".stl", ".3mf"]);

export type NativeFileDragPayload<Icon> = {
  file: string;
  files?: string[];
  icon: Icon;
};

export async function resolveDraggableFilePaths(
  rootPath: string,
  filePaths: string[]
): Promise<string[]> {
  return resolveDraggableFilePathsWithStat(rootPath, filePaths, async (filePath) => {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  });
}

export function resolveDraggableFilePathsSync(rootPath: string, filePaths: string[]): string[] {
  return resolveDraggableFilePathsWithStat(rootPath, filePaths, (filePath) =>
    statSync(filePath).isFile()
  );
}

export function createNativeFileDragPayload<Icon>(
  filePaths: string[],
  icon: Icon
): NativeFileDragPayload<Icon> {
  if (filePaths.length === 0) {
    throw new Error("Nenhum STL ou 3MF selecionado para arrastar.");
  }

  return filePaths.length === 1
    ? {
        file: filePaths[0],
        icon
      }
    : {
        file: filePaths[0],
        files: filePaths,
        icon
      };
}

function resolveDraggableFilePathsWithStat(
  rootPath: string,
  filePaths: string[],
  isFile: (filePath: string) => boolean
): string[];
function resolveDraggableFilePathsWithStat(
  rootPath: string,
  filePaths: string[],
  isFile: (filePath: string) => Promise<boolean>
): Promise<string[]>;
function resolveDraggableFilePathsWithStat(
  rootPath: string,
  filePaths: string[],
  isFile: (filePath: string) => boolean | Promise<boolean>
): string[] | Promise<string[]> {
  const normalizedRoot = path.resolve(rootPath);
  const resolvedPaths: string[] = [];

  const resolveFilePath = (filePath: string, isFileResult: boolean) => {
    const normalizedFilePath = path.resolve(filePath);
    assertInsideRoot(normalizedRoot, normalizedFilePath);

    const extension = path.extname(normalizedFilePath).toLowerCase();

    if (!PRINTABLE_FILE_EXTENSIONS.has(extension)) {
      throw new Error("Arraste para slicer aceita apenas STL e 3MF.");
    }

    if (!isFileResult) {
      throw new Error("Arquivo invalido para arrastar.");
    }

    resolvedPaths.push(normalizedFilePath);
  };

  for (const filePath of filePaths) {
    const normalizedFilePath = path.resolve(filePath);
    const isFileResult = isFile(normalizedFilePath);

    if (isFileResult instanceof Promise) {
      return resolveDraggableFilePathsAsync(
        filePaths,
        normalizedRoot,
        isFile as (filePath: string) => Promise<boolean>
      );
    }

    resolveFilePath(filePath, isFileResult);
  }

  if (resolvedPaths.length === 0) {
    throw new Error("Nenhum STL ou 3MF selecionado para arrastar.");
  }

  return resolvedPaths;
}

async function resolveDraggableFilePathsAsync(
  filePaths: string[],
  normalizedRoot: string,
  isFile: (filePath: string) => Promise<boolean>
): Promise<string[]> {
  const resolvedPaths: string[] = [];

  for (const filePath of filePaths) {
    const normalizedFilePath = path.resolve(filePath);
    assertInsideRoot(normalizedRoot, normalizedFilePath);

    const extension = path.extname(normalizedFilePath).toLowerCase();

    if (!PRINTABLE_FILE_EXTENSIONS.has(extension)) {
      throw new Error("Arraste para slicer aceita apenas STL e 3MF.");
    }

    if (!(await isFile(normalizedFilePath))) {
      throw new Error("Arquivo invalido para arrastar.");
    }

    resolvedPaths.push(normalizedFilePath);
  }

  if (resolvedPaths.length === 0) {
    throw new Error("Nenhum STL ou 3MF selecionado para arrastar.");
  }

  return resolvedPaths;
}

function assertInsideRoot(rootPath: string, candidatePath: string) {
  const relativePath = path.relative(rootPath, candidatePath);
  const isOutside = relativePath.startsWith("..") || path.isAbsolute(relativePath) || relativePath === "";

  if (isOutside) {
    throw new Error("Arquivo fora da biblioteca.");
  }
}
