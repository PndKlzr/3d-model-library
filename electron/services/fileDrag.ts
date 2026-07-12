import { realpathSync, statSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

const DRAGGABLE_FILE_EXTENSIONS = new Set([".stl", ".3mf", ".zip", ".rar", ".7z"]);

export type NativeFileDragPayload<Icon> = {
  file: string;
  files?: string[];
  icon: Icon;
};

export async function resolveDraggableFilePaths(
  rootPath: string,
  filePaths: string[]
): Promise<string[]> {
  const canonicalRoot = await realpath(rootPath);
  const resolvedPaths: string[] = [];
  const seenPaths = new Set<string>();

  for (const filePath of filePaths) {
    const canonicalFilePath = await realpath(filePath);
    assertInsideRoot(canonicalRoot, canonicalFilePath);
    assertSupportedExtension(canonicalFilePath);

    if (!(await stat(canonicalFilePath)).isFile()) {
      throw new Error("Arquivo invalido para arrastar.");
    }

    addUniquePath(resolvedPaths, seenPaths, canonicalFilePath);
  }

  assertHasFiles(resolvedPaths);
  return resolvedPaths;
}

export function resolveDraggableFilePathsSync(rootPath: string, filePaths: string[]): string[] {
  const canonicalRoot = realpathSync.native(rootPath);
  const resolvedPaths: string[] = [];
  const seenPaths = new Set<string>();

  for (const filePath of filePaths) {
    const canonicalFilePath = realpathSync.native(filePath);
    assertInsideRoot(canonicalRoot, canonicalFilePath);
    assertSupportedExtension(canonicalFilePath);

    if (!statSync(canonicalFilePath).isFile()) {
      throw new Error("Arquivo invalido para arrastar.");
    }

    addUniquePath(resolvedPaths, seenPaths, canonicalFilePath);
  }

  assertHasFiles(resolvedPaths);
  return resolvedPaths;
}

export function createNativeFileDragPayload<Icon>(
  filePaths: string[],
  icon: Icon
): NativeFileDragPayload<Icon> {
  assertHasFiles(filePaths);

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

function assertSupportedExtension(filePath: string) {
  if (!DRAGGABLE_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new Error("Arraste externo aceita apenas STL, 3MF, ZIP, RAR e 7Z.");
  }
}

function addUniquePath(resolvedPaths: string[], seenPaths: Set<string>, filePath: string) {
  const comparisonPath = process.platform === "win32" ? filePath.toLowerCase() : filePath;

  if (!seenPaths.has(comparisonPath)) {
    seenPaths.add(comparisonPath);
    resolvedPaths.push(filePath);
  }
}

function assertHasFiles(filePaths: string[]) {
  if (filePaths.length === 0) {
    throw new Error("Nenhum arquivo suportado para arrastar.");
  }
}

function assertInsideRoot(rootPath: string, candidatePath: string) {
  const relativePath = path.relative(rootPath, candidatePath);
  const isOutside =
    relativePath.startsWith("..") || path.isAbsolute(relativePath) || relativePath === "";

  if (isOutside) {
    throw new Error("Arquivo fora da biblioteca.");
  }
}
