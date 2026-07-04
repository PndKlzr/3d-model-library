import type { AppSettings, LibraryScanResult } from "./types";

export type ModelLibraryApi = {
  version: string;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  chooseLibraryFolder: () => Promise<string | null>;
  scanLibrary: (rootPath: string) => Promise<LibraryScanResult>;
};

declare global {
  interface Window {
    modelLibrary: ModelLibraryApi;
  }
}

export {};
