import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, LibraryScanResult } from "../src/shared/types.js";

contextBridge.exposeInMainWorld("modelLibrary", {
  version: "0.1.0",
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke("settings:save", settings) as Promise<AppSettings>,
  chooseLibraryFolder: () =>
    ipcRenderer.invoke("settings:choose-library-folder") as Promise<string | null>,
  scanLibrary: (rootPath: string) =>
    ipcRenderer.invoke("library:scan", rootPath) as Promise<LibraryScanResult>
});
