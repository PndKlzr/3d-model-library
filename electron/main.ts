import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppSettings, ModelHashInput } from "../src/shared/types.js";
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
import type { FileRestorePair } from "../src/shared/types.js";
import { scanLibrary } from "./services/libraryScanner.js";
import { readModelMetadata } from "./services/modelMetadata.js";
import { readEmbeddedThumbnail } from "./services/modelThumbnail.js";
import {
  createElectronLibraryMetadataStore,
  type LibraryMetadataStore
} from "./services/libraryMetadataStore.js";
import { createNativeFileDragPayload, resolveDraggableFilePathsSync } from "./services/fileDrag.js";
import { createElectronSettingsStore, type SettingsStore } from "./services/settingsStore.js";
import { launchSlicer } from "./services/slicerLauncher.js";
import { createElectronModelHashStore, type ModelHashStore } from "./services/modelHashStore.js";
import {
  prepareNativeFileDragHelper,
  startNativeFileDropDrag
} from "./services/nativeFileDragHelper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
let settingsStore: SettingsStore;
let libraryMetadataStore: LibraryMetadataStore;
let modelHashStore: ModelHashStore;
let nativeFileDragHelperPath: string | null = null;
const dragIcon = nativeImage.createFromDataURL(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZp7WQAAAABJRU5ErkJggg=="
);

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

  ipcMain.handle("library:scan", (_event, rootPath: string) => scanLibrary(rootPath));

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

      for (const sourcePath of sourcePaths) {
        libraryMetadataStore.movePathMetadata(
          sourcePath,
          resolveMovedModelPath(libraryPath, sourcePath, destinationRelativeFolder)
        );
      }

      return result;
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
        libraryMetadataStore.movePathMetadata(sourcePath, result.path);
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
        libraryMetadataStore.movePathMetadata(sourcePath, result.path);
      }

      return result;
    }
  );

  ipcMain.handle(
    "library:rename-model-file",
    async (_event, sourcePath: string, newName: string) => {
      const result = await renameModelFile(requireLibraryPath(), sourcePath, newName);

      if (result.path) {
        libraryMetadataStore.movePathMetadata(sourcePath, result.path);
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

    for (const pair of pathPairs) {
      libraryMetadataStore.movePathMetadata(pair.sourcePath, pair.destinationPath);
    }

    return result;
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

  ipcMain.on("model:start-file-drag", (event, filePaths: string[]) => {
    try {
      const resolvedPaths = resolveDraggableFilePathsSync(requireLibraryPath(), filePaths);

      if (startNativeFileDropDrag(nativeFileDragHelperPath, resolvedPaths)) {
        const message = `Arraste nativo iniciado para ${resolvedPaths.length} arquivo(s).`;
        event.sender.send("model:file-drag-status", { ok: true, message });
        console.log(`[file-drag] ${message}`);
        return;
      }

      event.sender.startDrag(createNativeFileDragPayload(resolvedPaths, dragIcon));
      const message = `Arraste Electron iniciado para ${resolvedPaths.length} arquivo(s).`;
      event.sender.send("model:file-drag-status", { ok: true, message });
      console.log(`[file-drag] ${message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      event.sender.send("model:file-drag-status", { ok: false, message });
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
  libraryMetadataStore = await createElectronLibraryMetadataStore();
  modelHashStore = await createElectronModelHashStore();
  nativeFileDragHelperPath = await prepareNativeFileDragHelper(app.getPath("userData")).catch(
    (error) => {
      console.error("[file-drag] native helper unavailable", error);
      return null;
    }
  );
  registerIpcHandlers();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
