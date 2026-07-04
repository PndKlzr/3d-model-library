import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, LibraryScanResult, SlicerLaunchResult } from "../src/shared/types.js";

contextBridge.exposeInMainWorld("modelLibrary", {
  version: "0.1.0",
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke("settings:save", settings) as Promise<AppSettings>,
  chooseLibraryFolder: () =>
    ipcRenderer.invoke("settings:choose-library-folder") as Promise<string | null>,
  scanLibrary: (rootPath: string) =>
    ipcRenderer.invoke("library:scan", rootPath) as Promise<LibraryScanResult>,
  readModelFile: (absolutePath: string) =>
    ipcRenderer.invoke("model:read-file", absolutePath) as Promise<ArrayBuffer>,
  chooseSlicerExecutable: () =>
    ipcRenderer.invoke("settings:choose-slicer-executable") as Promise<string | null>,
  launchSlicer: (slicerId: string, modelPath: string) =>
    ipcRenderer.invoke("slicer:launch", slicerId, modelPath) as Promise<SlicerLaunchResult>
});
