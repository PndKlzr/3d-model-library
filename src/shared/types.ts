export type SlicerConfig = {
  id: string;
  name: string;
  executablePath: string;
  enabled: boolean;
};

export type AppSettings = {
  libraryPath: string | null;
  includeSubfolders: boolean;
  archiveExtractorPath: string;
  slicers: SlicerConfig[];
};

export type ModelFile = {
  id: string;
  name: string;
  extension: ".stl" | ".3mf" | ".zip" | ".rar" | ".7z";
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
  folders: string[];
  errors: Array<{ path: string; message: string }>;
};

export type ModelHashInput = Pick<ModelFile, "absolutePath" | "sizeBytes" | "modifiedAt">;

export type ModelHashResult = Record<string, string>;

export type ModelUserMetadata = {
  favorite: boolean;
  tags: string[];
  notes: string;
};

export type SlicerHistoryEntry = {
  modelPath: string;
  slicerId: string;
  openedAt: string;
};

export type LibraryMetadata = {
  models: Record<string, ModelUserMetadata>;
  tagCatalog: string[];
  slicerHistory: SlicerHistoryEntry[];
};

export type SlicerLaunchResult = {
  ok: boolean;
  message: string;
};

export type FileDragStatus = {
  ok: boolean;
  message: string;
};

export type FileOperationResult = {
  ok: boolean;
  message: string;
  path?: string;
  paths?: string[];
};

export type ArchiveEntry = {
  path: string;
  name: string;
  extension: ".stl" | ".3mf";
  sizeBytes: number;
};

export type ArchiveListResult = {
  ok: boolean;
  archivePath: string;
  entries: ArchiveEntry[];
};

export type FileRestorePair = {
  sourcePath: string;
  destinationPath: string;
};

export type LibraryActionLogEntry = {
  id: string;
  label: string;
  detail: string;
  createdAt: string;
  undoable: boolean;
  undone: boolean;
};
