import path from "node:path";
import type { LibraryScanResult, ModelFile } from "../../src/shared/types.js";

const LIBRARY_INDEX_VERSION = 1 as const;

export type LibraryIndexSnapshot = {
  version: typeof LIBRARY_INDEX_VERSION;
  savedAt: string;
  result: LibraryScanResult;
};

export type LibraryIndexBackend = {
  get: () => unknown;
  set: (snapshot: LibraryIndexSnapshot) => void;
};

export type LibraryIndexStore = {
  get: (rootPath: string) => LibraryScanResult | null;
  set: (result: LibraryScanResult) => void;
};

export function createLibraryIndexStore(backend: LibraryIndexBackend): LibraryIndexStore {
  return {
    get(rootPath) {
      const snapshot = backend.get();

      if (!isLibraryIndexSnapshot(snapshot) || !samePath(snapshot.result.rootPath, rootPath)) {
        return null;
      }

      return cloneResult(snapshot.result);
    },

    set(result) {
      backend.set({
        version: LIBRARY_INDEX_VERSION,
        savedAt: new Date().toISOString(),
        result: cloneResult(result)
      });
    }
  };
}

export async function createElectronLibraryIndexStore(): Promise<LibraryIndexStore> {
  const { default: Store } = (await import("electron-store")) as {
    default: new (options: {
      name: string;
      defaults: { snapshot: null };
    }) => {
      get: (key: "snapshot") => unknown;
      set: (key: "snapshot", value: LibraryIndexSnapshot) => void;
    };
  };
  const store = new Store({ name: "library-index", defaults: { snapshot: null } });

  return createLibraryIndexStore({
    get: () => store.get("snapshot"),
    set: (snapshot) => store.set("snapshot", snapshot)
  });
}

function isLibraryIndexSnapshot(value: unknown): value is LibraryIndexSnapshot {
  if (!isRecord(value) || value.version !== LIBRARY_INDEX_VERSION || typeof value.savedAt !== "string") {
    return false;
  }

  const result = value.result;
  return (
    isRecord(result) &&
    typeof result.rootPath === "string" &&
    Array.isArray(result.folders) &&
    result.folders.every((folder) => typeof folder === "string") &&
    Array.isArray(result.errors) &&
    result.errors.every(isScanError) &&
    Array.isArray(result.models) &&
    result.models.every(isModelFile)
  );
}

function isModelFile(value: unknown): value is ModelFile {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    [".stl", ".3mf", ".zip", ".rar", ".7z"].includes(String(value.extension)) &&
    typeof value.absolutePath === "string" &&
    typeof value.relativeFolder === "string" &&
    typeof value.sizeBytes === "number" &&
    typeof value.modifiedAt === "string"
  );
}

function isScanError(value: unknown): value is LibraryScanResult["errors"][number] {
  return isRecord(value) && typeof value.path === "string" && typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => path.resolve(value).replaceAll("\\", "/").toLowerCase();
  return normalize(left) === normalize(right);
}

function cloneResult(result: LibraryScanResult): LibraryScanResult {
  return structuredClone(result);
}
