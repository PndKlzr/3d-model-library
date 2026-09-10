import path from "node:path";
import type { LibraryMetadata } from "../../src/shared/types.js";
import { cloneLibraryMetadata } from "./libraryMetadataStore.js";

export type LibraryMetadataMirrorRecord = {
  rootPath: string;
  libraryId: string;
  updatedAt: string;
  metadata: LibraryMetadata;
};

export type LibraryMetadataMirrorBackend = {
  get: () => unknown;
  set: (records: LibraryMetadataMirrorRecord[]) => void;
};

export type LibraryMetadataMirrorStore = {
  getByRoot: (rootPath: string) => LibraryMetadataMirrorRecord | null;
  set: (record: LibraryMetadataMirrorRecord) => void;
};

export function createLibraryMetadataMirrorStore(
  backend: LibraryMetadataMirrorBackend
): LibraryMetadataMirrorStore {
  function readRecords(): LibraryMetadataMirrorRecord[] {
    const value = backend.get();
    return Array.isArray(value) ? value.filter(isMirrorRecord).map(cloneRecord) : [];
  }

  return {
    getByRoot(rootPath) {
      const key = normalizeRoot(rootPath);
      const record = readRecords().find((candidate) => normalizeRoot(candidate.rootPath) === key);
      return record ? cloneRecord(record) : null;
    },

    set(record) {
      const key = normalizeRoot(record.rootPath);
      const records = readRecords().filter((candidate) => normalizeRoot(candidate.rootPath) !== key);
      backend.set([...records, cloneRecord(record)]);
    }
  };
}

export async function createElectronLibraryMetadataMirrorStore(): Promise<LibraryMetadataMirrorStore> {
  const { default: Store } = (await import("electron-store")) as {
    default: new (options: { name: string; defaults: { records: LibraryMetadataMirrorRecord[] } }) => {
      get: (key: "records") => unknown;
      set: (key: "records", value: LibraryMetadataMirrorRecord[]) => void;
    };
  };
  const store = new Store({
    name: "library-metadata-mirror",
    defaults: { records: [] }
  });

  return createLibraryMetadataMirrorStore({
    get: () => store.get("records"),
    set: (records) => store.set("records", records)
  });
}

function isMirrorRecord(value: unknown): value is LibraryMetadataMirrorRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "rootPath" in value &&
    typeof value.rootPath === "string" &&
    "libraryId" in value &&
    typeof value.libraryId === "string" &&
    "updatedAt" in value &&
    typeof value.updatedAt === "string" &&
    "metadata" in value &&
    typeof value.metadata === "object" &&
    value.metadata !== null
  );
}

function cloneRecord(record: LibraryMetadataMirrorRecord): LibraryMetadataMirrorRecord {
  return {
    rootPath: record.rootPath,
    libraryId: record.libraryId,
    updatedAt: record.updatedAt,
    metadata: cloneLibraryMetadata(record.metadata)
  };
}

function normalizeRoot(rootPath: string): string {
  return path.resolve(rootPath).replaceAll("\\", "/").toLowerCase();
}
