import type { SupportedFileExtension } from "./fileCapabilities.js";
import type { BuiltInSlicerKey } from "./slicerCatalog.js";

export type SlicerConfig = {
  id: string;
  name: string;
  kind: "built-in" | "custom";
  builtInKey?: BuiltInSlicerKey;
  executablePath: string;
  enabled: boolean;
  pathSource: "detected" | "manual" | null;
};

export type SlicerEvidence =
  | "app-path"
  | "uninstall"
  | "association"
  | "start-menu"
  | "known-directory";

export type SlicerCandidate = {
  builtInKey: BuiltInSlicerKey;
  executablePath: string;
  version?: string;
  evidence: SlicerEvidence;
};

export type FileDragBehavior = "organize-default" | "external-default";
export type AppLocale = "pt-BR" | "en";

export type AppSettings = {
  locale: AppLocale;
  libraryPath: string | null;
  includeSubfolders: boolean;
  monitorLibrary: boolean;
  fileDragBehavior: FileDragBehavior;
  archiveExtractorPath: string;
  defaultSlicerId: string | null;
  slicers: SlicerConfig[];
};

export type LibraryWatchEvent = {
  type: "add" | "change" | "unlink" | "addDir" | "unlinkDir";
  absolutePath: string;
};

export type ModelFile = {
  id: string;
  name: string;
  extension: SupportedFileExtension;
  absolutePath: string;
  relativeFolder: string;
  sizeBytes: number;
  modifiedAt: string;
  dimensionsMm: { x: number; y: number; z: number } | null;
  objectCount: number | null;
  previewError: string | null;
};

export type ThumbnailSignature = Pick<ModelFile, "absolutePath" | "sizeBytes" | "modifiedAt">;

export type LibraryScanResult = {
  rootPath: string;
  models: ModelFile[];
  folders: string[];
  errors: Array<{ path: string; message: string }>;
};

export type LibrarySessionRef = {
  generation: number;
  rootPath: string;
  libraryId: string;
};

export type LibraryActivationResult = {
  session: LibrarySessionRef;
  cachedResult: LibraryScanResult | null;
  metadata: LibraryMetadata;
  metadataStatus: LibraryMetadataStatus;
};

export type VersionedLibraryScanResult = {
  session: LibrarySessionRef;
  result: LibraryScanResult;
};

export type VersionedLibraryWatchEvents = {
  session: LibrarySessionRef;
  events: LibraryWatchEvent[];
};

export type VersionedLibraryMonitoringError = {
  session: LibrarySessionRef;
  message: string;
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

export type LibraryMetadataAvailability = "ready" | "read-only" | "unavailable";

export type LibraryMetadataStatus = {
  availability: LibraryMetadataAvailability;
  writable: boolean;
  source: "primary" | "backup" | "legacy" | "empty" | "mirror";
  message: string | null;
};

export type SlicerLaunchResult = {
  ok: boolean;
  message: string;
};

export type FileDragState = "started" | "dropped" | "cancelled" | "failed";

export type FileDragRequest = {
  sessionId: string;
  filePaths: string[];
};

export type FileDragStatus = {
  sessionId: string;
  state: FileDragState;
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
  extension: string;
  sizeBytes: number;
  isDirectory?: boolean;
};

export type ArchiveExtractionMode = "here" | "named-folder";

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
