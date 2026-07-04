import type { AppSettings, LibraryScanResult, SlicerLaunchResult } from "./types";

export type ModelLibraryApi = {
  version: string;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  chooseLibraryFolder: () => Promise<string | null>;
  scanLibrary: (rootPath: string) => Promise<LibraryScanResult>;
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
