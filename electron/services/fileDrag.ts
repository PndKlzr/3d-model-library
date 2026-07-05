import { stat } from "node:fs/promises";
import path from "node:path";

const PRINTABLE_FILE_EXTENSIONS = new Set([".stl", ".3mf"]);

export async function resolveDraggableFilePaths(
  rootPath: string,
  filePaths: string[]
): Promise<string[]> {
  const normalizedRoot = path.resolve(rootPath);
  const resolvedPaths: string[] = [];

  for (const filePath of filePaths) {
    const normalizedFilePath = path.resolve(filePath);
    assertInsideRoot(normalizedRoot, normalizedFilePath);

    const extension = path.extname(normalizedFilePath).toLowerCase();

    if (!PRINTABLE_FILE_EXTENSIONS.has(extension)) {
      throw new Error("Arraste para slicer aceita apenas STL e 3MF.");
    }

    const fileStat = await stat(normalizedFilePath);

    if (!fileStat.isFile()) {
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
