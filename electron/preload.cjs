const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("modelLibrary", {
  version: "0.1.0",
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  chooseLibraryFolder: () => ipcRenderer.invoke("settings:choose-library-folder"),
  scanLibrary: (rootPath) => ipcRenderer.invoke("library:scan", rootPath),
  createFolder: (parentRelativeFolder, folderName) =>
    ipcRenderer.invoke("library:create-folder", parentRelativeFolder, folderName),
  moveModels: (sourcePaths, destinationRelativeFolder) =>
    ipcRenderer.invoke("library:move-models", sourcePaths, destinationRelativeFolder),
  renameFolder: (folderRelativePath, newName) =>
    ipcRenderer.invoke("library:rename-folder", folderRelativePath, newName),
  renameModelFile: (sourcePath, newName) =>
    ipcRenderer.invoke("library:rename-model-file", sourcePath, newName),
  readModelMetadata: (absolutePath) => ipcRenderer.invoke("model:metadata", absolutePath),
  readModelThumbnail: (absolutePath) => ipcRenderer.invoke("model:thumbnail", absolutePath),
  readModelFile: (absolutePath) => ipcRenderer.invoke("model:read-file", absolutePath),
  chooseSlicerExecutable: () => ipcRenderer.invoke("settings:choose-slicer-executable"),
  launchSlicer: (slicerId, modelPath) => ipcRenderer.invoke("slicer:launch", slicerId, modelPath)
});
