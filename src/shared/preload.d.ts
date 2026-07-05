import type {
  AppSettings,
  ArchiveListResult,
  FileOperationResult,
  FileRestorePair,
  LibraryMetadata,
  LibraryScanResult,
  ModelHashInput,
  ModelHashResult,
  ModelFile,
  SlicerLaunchResult
} from "./types";

export type ModelLibraryApi = {
  version: string;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  chooseLibraryFolder: () => Promise<string | null>;
  scanLibrary: (rootPath: string) => Promise<LibraryScanResult>;
  listArchiveEntries: (archivePath: string) => Promise<ArchiveListResult>;
  extractArchiveEntries: (
    archivePath: string,
    entryPaths: string[],
    destinationRelativeFolder?: string
  ) => Promise<FileOperationResult>;
  createFolder: (
    parentRelativeFolder: string,
    folderName: string
  ) => Promise<FileOperationResult>;
  moveModels: (
    sourcePaths: string[],
    destinationRelativeFolder: string
  ) => Promise<FileOperationResult>;
  moveFolder: (
    folderRelativePath: string,
    destinationRelativeFolder: string
  ) => Promise<FileOperationResult>;
  renameFolder: (folderRelativePath: string, newName: string) => Promise<FileOperationResult>;
  renameModelFile: (sourcePath: string, newName: string) => Promise<FileOperationResult>;
  trashFolder: (folderRelativePath: string) => Promise<FileOperationResult>;
  trashModels: (sourcePaths: string[]) => Promise<FileOperationResult>;
  restoreLibraryPaths: (pathPairs: FileRestorePair[]) => Promise<FileOperationResult>;
  getLibraryMetadata: () => Promise<LibraryMetadata>;
  toggleFavorite: (modelPath: string) => Promise<LibraryMetadata>;
  setModelTags: (modelPath: string, tags: string[]) => Promise<LibraryMetadata>;
  addCatalogTag: (tag: string) => Promise<LibraryMetadata>;
  removeCatalogTag: (tag: string) => Promise<LibraryMetadata>;
  setModelNotes: (modelPath: string, notes: string) => Promise<LibraryMetadata>;
  readModelMetadata: (absolutePath: string) => Promise<{
    dimensionsMm: ModelFile["dimensionsMm"];
    objectCount: number | null;
    previewError: string | null;
  }>;
  readModelThumbnail: (absolutePath: string) => Promise<string | null>;
  saveConvertedStl: (sourcePath: string, stlContent: string) => Promise<FileOperationResult>;
  getModelHashes: (models: ModelHashInput[]) => Promise<ModelHashResult>;
  showModelInFolder: (absolutePath: string) => Promise<void>;
  readModelFile: (absolutePath: string) => Promise<ArrayBuffer>;
  chooseSlicerExecutable: () => Promise<string | null>;
  launchSlicer: (slicerId: string, modelPath: string) => Promise<SlicerLaunchResult>;
};

declare global {
  interface Window {
    modelLibrary: ModelLibraryApi;
  }
}

export {};
