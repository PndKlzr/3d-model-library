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
  trashModels: (sourcePaths) => ipcRenderer.invoke("library:trash-models", sourcePaths),
  restoreLibraryPaths: (pathPairs) => ipcRenderer.invoke("library:restore-paths", pathPairs),
  getLibraryMetadata: () => ipcRenderer.invoke("metadata:get"),
  toggleFavorite: (modelPath) => ipcRenderer.invoke("metadata:toggle-favorite", modelPath),
  setModelTags: (modelPath, tags) => ipcRenderer.invoke("metadata:set-tags", modelPath, tags),
  addCatalogTag: (tag) => ipcRenderer.invoke("metadata:add-catalog-tag", tag),
  removeCatalogTag: (tag) => ipcRenderer.invoke("metadata:remove-catalog-tag", tag),
  setModelNotes: (modelPath, notes) => ipcRenderer.invoke("metadata:set-notes", modelPath, notes),
  readModelMetadata: (absolutePath) => ipcRenderer.invoke("model:metadata", absolutePath),
  readModelThumbnail: (absolutePath) => ipcRenderer.invoke("model:thumbnail", absolutePath),
  getModelHashes: (models) => ipcRenderer.invoke("model:hashes", models),
  showModelInFolder: (absolutePath) => ipcRenderer.invoke("model:show-in-folder", absolutePath),
  readModelFile: (absolutePath) => ipcRenderer.invoke("model:read-file", absolutePath),
  chooseSlicerExecutable: () => ipcRenderer.invoke("settings:choose-slicer-executable"),
  launchSlicer: (slicerId, modelPath) => ipcRenderer.invoke("slicer:launch", slicerId, modelPath)
});
