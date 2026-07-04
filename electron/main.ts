import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppSettings } from "../src/shared/types.js";
import { scanLibrary } from "./services/libraryScanner.js";
import { createElectronSettingsStore } from "./services/settingsStore.js";
import { launchSlicer } from "./services/slicerLauncher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const settingsStore = createElectronSettingsStore();

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
    const settings = settingsStore.getSettings();

    if (!settings.libraryPath) {
      throw new Error("Library folder is not configured");
    }

    const relativePath = path.relative(settings.libraryPath, absolutePath);
    const isOutsideLibrary =
      relativePath.startsWith("..") || path.isAbsolute(relativePath) || relativePath === "";

    if (isOutsideLibrary) {
      throw new Error("Model file is outside the configured library folder");
    }

    const buffer = await readFile(absolutePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });
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
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await window.loadURL("http://127.0.0.1:5173");
  } else {
    await window.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  }
}

app.whenReady().then(async () => {
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
