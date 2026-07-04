import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppSettings } from "../src/shared/types.js";
import {
  createLibraryFolder,
  moveModelFiles,
  renameLibraryFolder,
  renameModelFile
} from "./services/fileOrganizer.js";
import { scanLibrary } from "./services/libraryScanner.js";
import { readModelMetadata } from "./services/modelMetadata.js";
import { readEmbeddedThumbnail } from "./services/modelThumbnail.js";
import { createElectronSettingsStore, type SettingsStore } from "./services/settingsStore.js";
import { launchSlicer } from "./services/slicerLauncher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
let settingsStore: SettingsStore;

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

  ipcMain.handle("library:rename-folder", (_event, folderRelativePath: string, newName: string) =>
    renameLibraryFolder(requireLibraryPath(), folderRelativePath, newName)
  );

  ipcMain.handle("library:rename-model-file", (_event, sourcePath: string, newName: string) =>
    renameModelFile(requireLibraryPath(), sourcePath, newName)
  );

  ipcMain.handle("model:metadata", async (_event, absolutePath: string) => {
    assertPathInsideLibrary(absolutePath);
    return readModelMetadata(absolutePath);
  });

  ipcMain.handle("model:thumbnail", async (_event, absolutePath: string) => {
    assertPathInsideLibrary(absolutePath);
    return readEmbeddedThumbnail(absolutePath);
  });

  ipcMain.handle("settings:choose-slicer-executable", async () => {
    const result = await dialog.showOpenDialog({
      title: "Escolha o executável do slicer",
      filters: [{ name: "Executáveis", extensions: ["exe"] }],
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

    return launchSlicer(slicer, modelPath);
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
