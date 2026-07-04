import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppSettings } from "../src/shared/types.js";
import { scanLibrary } from "./services/libraryScanner.js";
import { createElectronSettingsStore } from "./services/settingsStore.js";

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
