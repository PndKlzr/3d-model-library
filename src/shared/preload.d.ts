import type {
  AppSettings,
  ArchiveListResult,
  FileOperationResult,
  FileDragRequest,
  FileRestorePair,
  FileDragStatus,
  LibraryMetadata,
  LibraryMetadataStatus,
  LibraryActivationResult,
  LibrarySessionRef,
  VersionedLibraryMonitoringError,
  VersionedLibraryScanResult,
  VersionedLibraryWatchEvents,
  ModelHashInput,
  ModelHashResult,
  ModelFile,
  ThumbnailSignature,
  SlicerLaunchResult
} from "./types";
import type {
  ThumbnailBenchmarkReport,
  ThumbnailBenchmarkScenario
} from "../lib/thumbnailBenchmark";

export type ModelLibraryApi = {
  version: string;
  getThumbnailBenchmark: () => Promise<{
    scenario: ThumbnailBenchmarkScenario;
    models: ModelFile[];
    cachedIndexReadyMs: number;
  } | null>;
  markThumbnailBenchmarkCachedGridVisible: () => Promise<void>;
  submitThumbnailBenchmark: (report: ThumbnailBenchmarkReport) => Promise<void>;
  failThumbnailBenchmark: (message: string) => Promise<void>;
  getRuntimeVersions: () => Promise<{
    appVersion: string;
    electronVersion: string;
    chromiumVersion: string;
  }>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  chooseLibraryFolder: () => Promise<string | null>;
  chooseArchiveExtractor: () => Promise<string | null>;
  activateLibrary: (
    rootPath: string | null,
    monitoring: boolean
  ) => Promise<LibraryActivationResult | null>;
  getCurrentLibrary: () => Promise<LibraryActivationResult | null>;
  scanLibrary: (session: LibrarySessionRef) => Promise<VersionedLibraryScanResult>;
  setLibraryMonitoring: (session: LibrarySessionRef, enabled: boolean) => Promise<void>;
  onLibraryChanged: (callback: (payload: VersionedLibraryWatchEvents) => void) => () => void;
  onLibraryMonitoringError: (
    callback: (payload: VersionedLibraryMonitoringError) => void
  ) => () => void;
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
  getLibraryMetadataStatus: () => Promise<LibraryMetadataStatus>;
  retryLibraryMetadata: () => Promise<LibraryMetadataStatus>;
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
  readImageDataUrl: (session: LibrarySessionRef, absolutePath: string) => Promise<string>;
  readCachedThumbnail: (model: ThumbnailSignature) => Promise<string | null>;
  writeCachedThumbnail: (
    model: ThumbnailSignature,
    dataUrl: string,
    sessionKey: string
  ) => Promise<void>;
  saveConvertedStl: (sourcePath: string, stlContent: string) => Promise<FileOperationResult>;
  getModelHashes: (models: ModelHashInput[]) => Promise<ModelHashResult>;
  showModelInFolder: (absolutePath: string) => Promise<void>;
  openLibraryFile: (session: LibrarySessionRef, absolutePath: string) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  startFileDrag: (request: FileDragRequest) => void;
  onFileDragStatus: (callback: (status: FileDragStatus) => void) => () => void;
  readModelFile: (absolutePath: string) => Promise<ArrayBuffer>;
  chooseSlicerExecutable: () => Promise<string | null>;
  launchSlicer: (slicerId: string, modelPaths: string | string[]) => Promise<SlicerLaunchResult>;
};

declare global {
  interface Window {
    modelLibrary: ModelLibraryApi;
  }
}

export {};
