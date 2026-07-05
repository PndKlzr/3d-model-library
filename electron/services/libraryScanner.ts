import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { LibraryScanResult, ModelFile } from "../../src/shared/types.js";

const LIBRARY_FILE_EXTENSIONS = new Set([".stl", ".3mf", ".zip", ".rar", ".7z"]);

export async function scanLibrary(rootPath: string): Promise<LibraryScanResult> {
  const models: ModelFile[] = [];
  const folders = new Set<string>();
  const errors: LibraryScanResult["errors"] = [];

  async function scanDirectory(directoryPath: string) {
    const relativeDirectory = normalizeRelativeFolder(path.relative(rootPath, directoryPath));

    if (relativeDirectory) {
      folders.add(relativeDirectory);
    }

    let entries;

    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      errors.push({
        path: directoryPath,
        message: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        await scanDirectory(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();

      if (!LIBRARY_FILE_EXTENSIONS.has(extension)) {
        continue;
      }

      try {
        const fileStat = await stat(absolutePath);
        const relativeFolder = normalizeRelativeFolder(path.dirname(path.relative(rootPath, absolutePath)));

        models.push({
          id: absolutePath,
          name: entry.name,
          extension: extension as ModelFile["extension"],
          absolutePath,
          relativeFolder,
          sizeBytes: fileStat.size,
          modifiedAt: fileStat.mtime.toISOString(),
          dimensionsMm: null,
          objectCount: null,
          previewError: null
        });
      } catch (error) {
        errors.push({
          path: absolutePath,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  await scanDirectory(rootPath);

  models.sort((left, right) =>
    left.relativeFolder.localeCompare(right.relativeFolder) || left.name.localeCompare(right.name)
  );

  return { rootPath, models, folders: [...folders].sort(), errors };
}

function normalizeRelativeFolder(relativeFolder: string): string {
  if (relativeFolder === "." || relativeFolder === "") {
    return "";
  }

  return relativeFolder.split(path.sep).filter(Boolean).join("/");
}
