import type { AppSettings, LibraryScanResult, ModelFile, SlicerLaunchResult } from "./types";

export type ModelLibraryApi = {
  version: string;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  chooseLibraryFolder: () => Promise<string | null>;
  scanLibrary: (rootPath: string) => Promise<LibraryScanResult>;
  readModelMetadata: (absolutePath: string) => Promise<{
    dimensionsMm: ModelFile["dimensionsMm"];
    objectCount: number | null;
    previewError: string | null;
  }>;
  readModelThumbnail: (absolutePath: string) => Promise<string | null>;
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
