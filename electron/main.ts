import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell, type WebContents } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppSettings,
  FileDragRequest,
  FileDragStatus,
  FileOperationResult,
  FileRestorePair,
  ModelHashInput
} from "../src/shared/types.js";
import { extractArchiveEntries, listArchiveEntries } from "./services/archiveManager.js";
import {
  createLibraryFolder,
  moveLibraryFolder,
  moveModelFiles,
  renameLibraryFolder,
  renameModelFile,
  restoreLibraryPaths,
  saveConvertedStlFile,
  trashLibraryFolder,
  trashModelFiles
} from "./services/fileOrganizer.js";
import { applyLibraryWatchEvents, scanLibrary } from "./services/libraryScanner.js";
import {
  createElectronLibraryIndexStore,
  type LibraryIndexStore
} from "./services/libraryIndexStore.js";
import { readModelMetadata } from "./services/modelMetadata.js";
import { readEmbeddedThumbnail } from "./services/modelThumbnail.js";
import {
  createElectronLibraryMetadataStore,
  type LibraryMetadataStore
} from "./services/libraryMetadataStore.js";
import {
  createNativeFileDragPayload,
  resolveDraggableFilePathsSync
} from "./services/fileDrag.js";
import { createElectronSettingsStore, type SettingsStore } from "./services/settingsStore.js";
import { launchSlicer } from "./services/slicerLauncher.js";
import { createElectronModelHashStore, type ModelHashStore } from "./services/modelHashStore.js";
import { createThumbnailCache, type ThumbnailCache } from "./services/thumbnailCache.js";
import {
  createLibraryWatcher,
  type LibraryWatcherHandle
} from "./services/libraryWatcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
let settingsStore: SettingsStore;
let libraryIndexStore: LibraryIndexStore;
let libraryMetadataStore: LibraryMetadataStore;
let modelHashStore: ModelHashStore;
let libraryWatcher: LibraryWatcherHandle | null = null;
let thumbnailCache: ThumbnailCache;
let watcherGeneration = 0;
const dragIcon = createFileDragIcon();

function registerIpcHandlers() {
  ipcMain.handle("settings:get", () => settingsStore.getSettings());

  ipcMain.handle("settings:save", (_event, settings: AppSettings) =>
    settingsStore.saveSettings(settings)
  );

  ipcMain.handle("settings:choose-library-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Escolha sua pasta de STLs e 3MFs",
      properties: ["openDirectory"]
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("library:get-cached", (_event, rootPath: string) => {
    assertConfiguredLibraryRoot(rootPath);
    return libraryIndexStore.get(rootPath);
  });

  ipcMain.handle("library:scan", async (_event, rootPath: string) => {
    assertConfiguredLibraryRoot(rootPath);
    const result = await scanLibrary(rootPath);
    libraryIndexStore.set(result);
    return result;
  });

  ipcMain.handle("library:set-monitoring", (_event, enabled: boolean) =>
    setLibraryMonitoring(enabled === true)
  );

  ipcMain.handle("archive:list", (_event, archivePath: string) =>
    listArchiveEntries(requireLibraryPath(), archivePath, getArchiveToolOptions())
  );

  ipcMain.handle(
    "archive:extract",
    (_event, archivePath: string, entryPaths: string[], destinationRelativeFolder?: string) =>
      extractArchiveEntries(
        requireLibraryPath(),
        archivePath,
        entryPaths,
        destinationRelativeFolder,
        getArchiveToolOptions()
      )
  );

  ipcMain.handle(
    "library:create-folder",
    (_event, parentRelativeFolder: string, folderName: string) =>
      createLibraryFolder(requireLibraryPath(), parentRelativeFolder, folderName)
  );

  ipcMain.handle(
    "library:move-models",
    async (_event, sourcePaths: string[], destinationRelativeFolder: string) => {
      const libraryPath = requireLibraryPath();
      const result = await moveModelFiles(libraryPath, sourcePaths, destinationRelativeFolder);
      const metadataWarnings: string[] = [];

      for (const sourcePath of sourcePaths) {
        metadataWarnings.push(
          ...movePathMetadataSafely(
            sourcePath,
            resolveMovedModelPath(libraryPath, sourcePath, destinationRelativeFolder)
          )
        );
      }

      return withMetadataWarnings(result, metadataWarnings);
    }
  );

  ipcMain.handle(
    "library:move-folder",
    async (_event, folderRelativePath: string, destinationRelativeFolder: string) => {
      const libraryPath = requireLibraryPath();
      const sourcePath = resolveLibraryRelativePath(libraryPath, folderRelativePath);
      const result = await moveLibraryFolder(
        libraryPath,
        folderRelativePath,
        destinationRelativeFolder
      );

      if (result.path) {
        return withMetadataWarnings(result, movePathMetadataSafely(sourcePath, result.path));
      }

      return result;
    }
  );

  ipcMain.handle(
    "library:rename-folder",
    async (_event, folderRelativePath: string, newName: string) => {
      const libraryPath = requireLibraryPath();
      const sourcePath = resolveLibraryRelativePath(libraryPath, folderRelativePath);
      const result = await renameLibraryFolder(libraryPath, folderRelativePath, newName);

      if (result.path) {
        return withMetadataWarnings(result, movePathMetadataSafely(sourcePath, result.path));
      }

      return result;
    }
  );

  ipcMain.handle(
    "library:rename-model-file",
    async (_event, sourcePath: string, newName: string) => {
      const result = await renameModelFile(requireLibraryPath(), sourcePath, newName);

      if (result.path) {
        return withMetadataWarnings(result, movePathMetadataSafely(sourcePath, result.path));
      }

      return result;
    }
  );

  ipcMain.handle("model:save-converted-stl", (_event, sourcePath: string, stlContent: string) =>
    saveConvertedStlFile(requireLibraryPath(), sourcePath, stlContent)
  );

  ipcMain.handle("library:trash-models", (_event, sourcePaths: string[]) =>
    trashModelFiles(requireLibraryPath(), sourcePaths, (modelPath) => shell.trashItem(modelPath))
  );

  ipcMain.handle("library:trash-folder", (_event, folderRelativePath: string) =>
    trashLibraryFolder(requireLibraryPath(), folderRelativePath, (folderPath) =>
      shell.trashItem(folderPath)
    )
  );

  ipcMain.handle("library:restore-paths", async (_event, pathPairs: FileRestorePair[]) => {
    const result = await restoreLibraryPaths(requireLibraryPath(), pathPairs);
    const metadataWarnings: string[] = [];

    for (const pair of pathPairs) {
      metadataWarnings.push(...movePathMetadataSafely(pair.sourcePath, pair.destinationPath));
    }

    return withMetadataWarnings(result, metadataWarnings);
  });

  ipcMain.handle("metadata:get", () => libraryMetadataStore.getMetadata());

  ipcMain.handle("metadata:toggle-favorite", (_event, modelPath: string) => {
    assertPathInsideLibrary(modelPath);
    return libraryMetadataStore.toggleFavorite(modelPath);
  });

  ipcMain.handle("metadata:set-tags", (_event, modelPath: string, tags: string[]) => {
    assertPathInsideLibrary(modelPath);
    return libraryMetadataStore.setTags(modelPath, tags);
  });

  ipcMain.handle("metadata:add-catalog-tag", (_event, tag: string) =>
    libraryMetadataStore.addCatalogTag(tag)
  );

  ipcMain.handle("metadata:remove-catalog-tag", (_event, tag: string) =>
    libraryMetadataStore.removeCatalogTag(tag)
  );

  ipcMain.handle("metadata:set-notes", (_event, modelPath: string, notes: string) => {
    assertPathInsideLibrary(modelPath);
    return libraryMetadataStore.setNotes(modelPath, notes);
  });

  ipcMain.handle("model:metadata", async (_event, absolutePath: string) => {
    assertPathInsideLibrary(absolutePath);
    return readModelMetadata(absolutePath);
  });

  ipcMain.handle("model:thumbnail", async (_event, absolutePath: string) => {
    assertPathInsideLibrary(absolutePath);
    return readEmbeddedThumbnail(absolutePath);
  });

  ipcMain.handle("thumbnail:cache-read", async (_event, model) => {
    assertThumbnailSignature(model);
    assertPathInsideLibrary(model.absolutePath);
    return thumbnailCache.read(model);
  });

  ipcMain.handle("thumbnail:cache-write", async (_event, model, dataUrl: string) => {
    assertThumbnailSignature(model);
    assertPathInsideLibrary(model.absolutePath);

    if (typeof dataUrl !== "string") {
      throw new Error("Invalid thumbnail data");
    }

    await thumbnailCache.write(model, dataUrl);
  });

  ipcMain.handle("model:hashes", async (_event, models: ModelHashInput[]) => {
    for (const model of models) {
      assertPathInsideLibrary(model.absolutePath);
    }

    return modelHashStore.getHashes(models);
  });

  ipcMain.handle("model:show-in-folder", (_event, absolutePath: string) => {
    assertPathInsideLibrary(absolutePath);
    shell.showItemInFolder(absolutePath);
  });

  ipcMain.on("model:start-file-drag", (event, request: FileDragRequest) => {
    const sessionId = typeof request?.sessionId === "string" ? request.sessionId : "invalid-session";

    try {
      if (!request || typeof request.sessionId !== "string" || !Array.isArray(request.filePaths)) {
        throw new Error("Solicitacao de arraste invalida.");
      }

      const resolvedPaths = resolveDraggableFilePathsSync(
        requireLibraryPath(),
        request.filePaths
      );

      sendFileDragStatus(event.sender, {
        sessionId: request.sessionId,
        state: "started",
        message: `Arraste iniciado para ${resolvedPaths.length} arquivo(s).`
      });
      event.sender.startDrag(createNativeFileDragPayload(resolvedPaths, dragIcon));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendFileDragStatus(event.sender, { sessionId, state: "failed", message });
      console.error("[file-drag]", error);
    }
  });

  ipcMain.handle("settings:choose-slicer-executable", async () => {
    const result = await dialog.showOpenDialog({
      title: "Escolha o executável do slicer",
      filters: [{ name: "Executáveis", extensions: ["exe"] }],
      properties: ["openFile"]
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("settings:choose-archive-extractor", async () => {
    const result = await dialog.showOpenDialog({
      title: "Escolha o 7z.exe",
      filters: [{ name: "7-Zip", extensions: ["exe"] }],
      properties: ["openFile"]
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("slicer:launch", async (_event, slicerId: string, modelPaths: string | string[]) => {
    const settings = settingsStore.getSettings();
    const slicer = settings.slicers.find((item) => item.id === slicerId);
    const launchPaths = Array.isArray(modelPaths) ? modelPaths : [modelPaths];

    if (!slicer) {
      return { ok: false, message: "Slicer não configurado." };
    }

    for (const modelPath of launchPaths) {
      assertPathInsideLibrary(modelPath);
    }

    const result = await launchSlicer(slicer, launchPaths);

    if (result.ok) {
      for (const modelPath of launchPaths) {
        libraryMetadataStore.recordSlicerOpen(modelPath, slicerId);
      }
    }

    return result;
  });

  ipcMain.handle("model:read-file", async (_event, absolutePath: string) => {
    assertPathInsideLibrary(absolutePath);

    const buffer = await readFile(absolutePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });
}

function assertPathInsideLibrary(absolutePath: string) {
  const libraryPath = requireLibraryPath();

  const relativePath = path.relative(libraryPath, absolutePath);
  const isOutsideLibrary =
    relativePath.startsWith("..") || path.isAbsolute(relativePath) || relativePath === "";

  if (isOutsideLibrary) {
    throw new Error("Model file is outside the configured library folder");
  }
}

function assertConfiguredLibraryRoot(rootPath: string) {
  const libraryPath = requireLibraryPath();

  if (path.resolve(rootPath).toLowerCase() !== path.resolve(libraryPath).toLowerCase()) {
    throw new Error("Requested library does not match the configured library folder");
  }
}

function assertThumbnailSignature(value: unknown): asserts value is {
  absolutePath: string;
  sizeBytes: number;
  modifiedAt: string;
} {
  if (
    typeof value !== "object" ||
    value === null ||
    !("absolutePath" in value) ||
    typeof value.absolutePath !== "string" ||
    !("sizeBytes" in value) ||
    typeof value.sizeBytes !== "number" ||
    !("modifiedAt" in value) ||
    typeof value.modifiedAt !== "string"
  ) {
    throw new Error("Invalid thumbnail signature");
  }
}

function requireLibraryPath(): string {
  const settings = settingsStore.getSettings();

  if (!settings.libraryPath) {
    throw new Error("Library folder is not configured");
  }

  return settings.libraryPath;
}

function getArchiveToolOptions() {
  return {
    extractorPath: settingsStore.getSettings().archiveExtractorPath
  };
}

async function setLibraryMonitoring(enabled: boolean): Promise<void> {
  watcherGeneration += 1;
  const generation = watcherGeneration;

  if (libraryWatcher) {
    await libraryWatcher.close();
    libraryWatcher = null;
  }

  if (!enabled) {
    return;
  }

  const libraryPath = requireLibraryPath();
  libraryWatcher = createLibraryWatcher({
    rootPath: libraryPath,
    onBatch: async (events) => {
      if (generation !== watcherGeneration) {
        return;
      }

      const current = libraryIndexStore.get(libraryPath) ?? (await scanLibrary(libraryPath));
      const result = await applyLibraryWatchEvents(current, events);
      libraryIndexStore.set(result);

      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("library:changed", events);
      }
    },
    onError: (error) => {
      if (generation !== watcherGeneration) {
        return;
      }

      watcherGeneration += 1;
      const message = error instanceof Error ? error.message : String(error);
      void libraryWatcher?.close();
      libraryWatcher = null;

      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(
          "library:monitoring-error",
          `Monitoramento pausado: ${message}`
        );
      }
    }
  });
}

function resolveLibraryRelativePath(libraryPath: string, relativePath: string): string {
  return path.resolve(libraryPath, relativePath);
}

function resolveMovedModelPath(
  libraryPath: string,
  sourcePath: string,
  destinationRelativeFolder: string
): string {
  return path.join(
    resolveLibraryRelativePath(libraryPath, destinationRelativeFolder),
    path.basename(sourcePath)
  );
}

function movePathMetadataSafely(sourcePath: string, destinationPath: string): string[] {
  try {
    libraryMetadataStore.movePathMetadata(sourcePath, destinationPath);
    return [];
  } catch (error) {
    console.error("[metadata] failed to migrate path metadata", {
      sourcePath,
      destinationPath,
      error
    });
    return ["Arquivos movidos, mas algumas tags/notas podem precisar ser recarregadas."];
  }
}

function withMetadataWarnings(
  result: FileOperationResult,
  metadataWarnings: string[]
): FileOperationResult {
  const uniqueWarnings = [...new Set(metadataWarnings)];

  if (uniqueWarnings.length === 0) {
    return result;
  }

  return {
    ...result,
    message: `${result.message} ${uniqueWarnings.join(" ")}`
  };
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#e9edf0",
    title: "3D Model Library",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer:load-failed] ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[renderer:gone] ${details.reason}`);
  });

  if (isDev) {
    await window.loadURL("http://127.0.0.1:5173");
  } else {
    await window.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  }
}

app.whenReady().then(async () => {
  settingsStore = await createElectronSettingsStore();
  libraryIndexStore = await createElectronLibraryIndexStore();
  libraryMetadataStore = await createElectronLibraryMetadataStore();
  modelHashStore = await createElectronModelHashStore();
  thumbnailCache = createThumbnailCache({
    cacheDirectory: path.join(app.getPath("userData"), "thumbnail-cache")
  });
  registerIpcHandlers();
  await createWindow();
  setTimeout(() => {
    void thumbnailCache.prune().catch((error) => console.error("[thumbnail-cache]", error));
  }, 5_000);

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

function sendFileDragStatus(sender: WebContents, status: FileDragStatus) {
  sender.send("model:file-drag-status", status);
  console.log(`[file-drag:${status.state}] ${status.sessionId} ${status.message}`);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  watcherGeneration += 1;
  void libraryWatcher?.close();
  libraryWatcher = null;
});

function createFileDragIcon() {
  const width = 48;
  const height = 48;
  const bitmap = Buffer.alloc(width * height * 4);

  function fillRect(x: number, y: number, rectWidth: number, rectHeight: number, color: number[]) {
    for (let row = y; row < y + rectHeight; row += 1) {
      for (let column = x; column < x + rectWidth; column += 1) {
        const offset = (row * width + column) * 4;
        bitmap[offset] = color[2];
        bitmap[offset + 1] = color[1];
        bitmap[offset + 2] = color[0];
        bitmap[offset + 3] = color[3];
      }
    }
  }

  fillRect(5, 5, 38, 38, [34, 132, 127, 255]);
  fillRect(14, 10, 20, 28, [245, 249, 249, 255]);
  fillRect(18, 17, 12, 3, [34, 132, 127, 255]);
  fillRect(18, 24, 12, 3, [34, 132, 127, 255]);
  fillRect(18, 31, 8, 3, [34, 132, 127, 255]);

  return nativeImage.createFromBitmap(bitmap, { width, height, scaleFactor: 1 });
}
