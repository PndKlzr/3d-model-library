const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("modelLibrary", {
  version: "0.1.0",
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  chooseLibraryFolder: () => ipcRenderer.invoke("settings:choose-library-folder"),
  chooseArchiveExtractor: () => ipcRenderer.invoke("settings:choose-archive-extractor"),
  getCachedLibrary: (rootPath) => ipcRenderer.invoke("library:get-cached", rootPath),
  scanLibrary: (rootPath) => ipcRenderer.invoke("library:scan", rootPath),
  setLibraryMonitoring: (enabled) => ipcRenderer.invoke("library:set-monitoring", enabled),
  onLibraryChanged: (callback) => {
    const listener = (_event, events) => callback(events);
    ipcRenderer.on("library:changed", listener);
    return () => ipcRenderer.removeListener("library:changed", listener);
  },
  onLibraryMonitoringError: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("library:monitoring-error", listener);
    return () => ipcRenderer.removeListener("library:monitoring-error", listener);
  },
  listArchiveEntries: (archivePath) => ipcRenderer.invoke("archive:list", archivePath),
  extractArchiveEntries: (archivePath, entryPaths, destinationRelativeFolder) =>
    ipcRenderer.invoke("archive:extract", archivePath, entryPaths, destinationRelativeFolder),
  createFolder: (parentRelativeFolder, folderName) =>
    ipcRenderer.invoke("library:create-folder", parentRelativeFolder, folderName),
  moveModels: (sourcePaths, destinationRelativeFolder) =>
    ipcRenderer.invoke("library:move-models", sourcePaths, destinationRelativeFolder),
  moveFolder: (folderRelativePath, destinationRelativeFolder) =>
    ipcRenderer.invoke("library:move-folder", folderRelativePath, destinationRelativeFolder),
  renameFolder: (folderRelativePath, newName) =>
    ipcRenderer.invoke("library:rename-folder", folderRelativePath, newName),
  renameModelFile: (sourcePath, newName) =>
    ipcRenderer.invoke("library:rename-model-file", sourcePath, newName),
  trashFolder: (folderRelativePath) => ipcRenderer.invoke("library:trash-folder", folderRelativePath),
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
  readCachedThumbnail: (model) => ipcRenderer.invoke("thumbnail:cache-read", model),
  writeCachedThumbnail: (model, dataUrl) =>
    ipcRenderer.invoke("thumbnail:cache-write", model, dataUrl),
  saveConvertedStl: (sourcePath, stlContent) =>
    ipcRenderer.invoke("model:save-converted-stl", sourcePath, stlContent),
  getModelHashes: (models) => ipcRenderer.invoke("model:hashes", models),
  showModelInFolder: (absolutePath) => ipcRenderer.invoke("model:show-in-folder", absolutePath),
  startFileDrag: (request) => ipcRenderer.send("model:start-file-drag", request),
  onFileDragStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("model:file-drag-status", listener);
    return () => ipcRenderer.removeListener("model:file-drag-status", listener);
  },
  readModelFile: (absolutePath) => ipcRenderer.invoke("model:read-file", absolutePath),
  chooseSlicerExecutable: () => ipcRenderer.invoke("settings:choose-slicer-executable"),
  launchSlicer: (slicerId, modelPaths) => ipcRenderer.invoke("slicer:launch", slicerId, modelPaths)
});
