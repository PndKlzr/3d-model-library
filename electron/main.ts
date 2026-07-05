import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
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
import { createElectronSettingsStore, type SettingsStore } from "./services/settingsStore.js";
import { launchSlicer } from "./services/slicerLauncher.js";
import { createElectronModelHashStore, type ModelHashStore } from "./services/modelHashStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
let settingsStore: SettingsStore;
let libraryMetadataStore: LibraryMetadataStore;
let modelHashStore: ModelHashStore;

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
    (_event, sourcePaths: string[], destinationRelativeFolder: string) =>
      moveModelFiles(requireLibraryPath(), sourcePaths, destinationRelativeFolder)
  );

  ipcMain.handle(
    "library:move-folder",
    (_event, folderRelativePath: string, destinationRelativeFolder: string) =>
      moveLibraryFolder(requireLibraryPath(), folderRelativePath, destinationRelativeFolder)
  );

  ipcMain.handle("library:rename-folder", (_event, folderRelativePath: string, newName: string) =>
    renameLibraryFolder(requireLibraryPath(), folderRelativePath, newName)
  );

  ipcMain.handle("library:rename-model-file", (_event, sourcePath: string, newName: string) =>
    renameModelFile(requireLibraryPath(), sourcePath, newName)
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

  ipcMain.handle("library:restore-paths", (_event, pathPairs: FileRestorePair[]) =>
    restoreLibraryPaths(requireLibraryPath(), pathPairs)
  );

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

  ipcMain.handle("slicer:launch", async (_event, slicerId: string, modelPath: string) => {
    const settings = settingsStore.getSettings();
    const slicer = settings.slicers.find((item) => item.id === slicerId);

    if (!slicer) {
      return { ok: false, message: "Slicer não configurado." };
    }

    const result = await launchSlicer(slicer, modelPath);

    if (result.ok) {
      libraryMetadataStore.recordSlicerOpen(modelPath, slicerId);
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
