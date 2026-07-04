export type SlicerConfig = {
  id: string;
  name: string;
  executablePath: string;
  enabled: boolean;
};

export type AppSettings = {
  libraryPath: string | null;
  includeSubfolders: boolean;
  slicers: SlicerConfig[];
};

export type ModelFile = {
  id: string;
  name: string;
  extension: ".stl" | ".3mf";
  absolutePath: string;
  relativeFolder: string;
  sizeBytes: number;
  modifiedAt: string;
  dimensionsMm: { x: number; y: number; z: number } | null;
  objectCount: number | null;
  previewError: string | null;
};

export type LibraryScanResult = {
  rootPath: string;
  models: ModelFile[];
  errors: Array<{ path: string; message: string }>;
};

export type SlicerLaunchResult = {
  ok: boolean;
  message: string;
};
