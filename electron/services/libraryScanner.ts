import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  SUPPORTED_FILE_EXTENSIONS,
  type SupportedFileExtension
} from "../../src/shared/fileCapabilities.js";
import type { LibraryScanResult, LibraryWatchEvent, ModelFile } from "../../src/shared/types.js";
import { runBounded } from "./boundedTaskPool.js";
import { isInternalLibraryPath } from "./portableMetadataCodec.js";

const LIBRARY_FILE_EXTENSIONS = new Set<string>(SUPPORTED_FILE_EXTENSIONS);
const FILE_STAT_CONCURRENCY = 8;

type ModelCandidate = {
  absolutePath: string;
  extension: ModelFile["extension"];
  name: string;
};

export async function scanLibrary(rootPath: string): Promise<LibraryScanResult> {
  const models: ModelFile[] = [];
  const folders = new Set<string>();
  const errors: LibraryScanResult["errors"] = [];
  const candidates: ModelCandidate[] = [];

  async function scanDirectory(directoryPath: string) {
    if (isInternalLibraryPath(rootPath, directoryPath)) {
      return;
    }

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

      candidates.push({
        absolutePath,
        extension: extension as SupportedFileExtension,
        name: entry.name
      });
    }
  }

  await scanDirectory(rootPath);

  const scannedModels = await runBounded(
    candidates,
    FILE_STAT_CONCURRENCY,
    async ({ absolutePath, extension, name }): Promise<ModelFile | null> => {
      try {
        const fileStat = await stat(absolutePath);
        const relativeFolder = normalizeRelativeFolder(
          path.dirname(path.relative(rootPath, absolutePath))
        );

        return {
          id: absolutePath,
          name,
          extension,
          absolutePath,
          relativeFolder,
          sizeBytes: fileStat.size,
          modifiedAt: fileStat.mtime.toISOString(),
          dimensionsMm: null,
          objectCount: null,
          previewError: null
        };
      } catch (error) {
        errors.push({
          path: absolutePath,
          message: error instanceof Error ? error.message : String(error)
        });
        return null;
      }
    }
  );

  models.push(...scannedModels.filter((model): model is ModelFile => model !== null));

  models.sort((left, right) =>
    left.relativeFolder.localeCompare(right.relativeFolder) || left.name.localeCompare(right.name)
  );

  return { rootPath, models, folders: [...folders].sort(), errors };
}

export async function applyLibraryWatchEvents(
  current: LibraryScanResult,
  events: LibraryWatchEvent[]
): Promise<LibraryScanResult> {
  const modelsByPath = new Map(
    current.models.map((model) => [normalizePathKey(model.absolutePath), model])
  );
  const folders = new Set(current.folders);
  const errors = [...current.errors];

  for (const event of events) {
    if (!isPathInsideRoot(current.rootPath, event.absolutePath)) {
      continue;
    }

    if (isInternalLibraryPath(current.rootPath, event.absolutePath)) {
      continue;
    }

    const relativePath = normalizeRelativeFolder(path.relative(current.rootPath, event.absolutePath));

    if (event.type === "addDir") {
      if (relativePath) {
        folders.add(relativePath);
      }
      continue;
    }

    if (event.type === "unlinkDir") {
      for (const folder of folders) {
        if (folder === relativePath || folder.startsWith(`${relativePath}/`)) {
          folders.delete(folder);
        }
      }
      for (const [modelPath, model] of modelsByPath) {
        if (model.relativeFolder === relativePath || model.relativeFolder.startsWith(`${relativePath}/`)) {
          modelsByPath.delete(modelPath);
        }
      }
      continue;
    }

    const modelKey = normalizePathKey(event.absolutePath);

    if (event.type === "unlink") {
      modelsByPath.delete(modelKey);
      continue;
    }

    const model = await readModelCandidate(current.rootPath, event.absolutePath);

    if (model) {
      modelsByPath.set(modelKey, model);
      if (model.relativeFolder) {
        folders.add(model.relativeFolder);
      }
    } else {
      modelsByPath.delete(modelKey);
    }
  }

  const models = [...modelsByPath.values()].sort(compareModels);
  return { rootPath: current.rootPath, models, folders: [...folders].sort(), errors };
}

function normalizeRelativeFolder(relativeFolder: string): string {
  if (relativeFolder === "." || relativeFolder === "") {
    return "";
  }

  return relativeFolder.split(path.sep).filter(Boolean).join("/");
}

async function readModelCandidate(rootPath: string, absolutePath: string): Promise<ModelFile | null> {
  const extension = path.extname(absolutePath).toLowerCase();

  if (!LIBRARY_FILE_EXTENSIONS.has(extension)) {
    return null;
  }

  try {
    const fileStat = await stat(absolutePath);

    if (!fileStat.isFile()) {
      return null;
    }

    return {
      id: absolutePath,
      name: path.basename(absolutePath),
      extension: extension as SupportedFileExtension,
      absolutePath,
      relativeFolder: normalizeRelativeFolder(path.dirname(path.relative(rootPath, absolutePath))),
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
      dimensionsMm: null,
      objectCount: null,
      previewError: null
    };
  } catch {
    return null;
  }
}

function compareModels(left: ModelFile, right: ModelFile): number {
  return left.relativeFolder.localeCompare(right.relativeFolder) || left.name.localeCompare(right.name);
}

function isPathInsideRoot(rootPath: string, absolutePath: string): boolean {
  const relative = path.relative(rootPath, absolutePath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizePathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll("\\", "/").toLowerCase();
}
