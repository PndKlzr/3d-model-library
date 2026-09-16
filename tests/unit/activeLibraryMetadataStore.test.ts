import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createActiveLibraryMetadataStore,
  type ActiveLibraryMetadataStoreOptions
} from "../../electron/services/activeLibraryMetadataStore";
import {
  createLibraryMetadataMirrorStore,
  type LibraryMetadataMirrorBackend,
  type LibraryMetadataMirrorRecord
} from "../../electron/services/libraryMetadataMirrorStore";
import {
  createLibraryMetadataStore,
  type LibraryMetadataStore
} from "../../electron/services/libraryMetadataStore";
import {
  decodePortableMetadata,
  encodePortableMetadata,
  type PortableLibraryManifestV1
} from "../../electron/services/portableMetadataCodec";
import type { LibraryMetadata } from "../../src/shared/types";

describe("activeLibraryMetadataStore", () => {
  it("keeps metadata isolated when switching between libraries", async () => {
    const harness = createHarness();
    await harness.store.open("C:/library-a");
    await harness.store.setNotes("C:/library-a/a.stl", "library A");

    await harness.store.open("C:/library-b");
    expect(harness.store.getMetadata().models).toEqual({});
    await harness.store.toggleFavorite("C:/library-b/b.stl");

    await harness.store.open("C:/library-a");
    expect(harness.store.getMetadata().models[path.resolve("C:/library-a/a.stl")].notes).toBe(
      "library A"
    );
    expect(harness.store.getMetadata().models[path.resolve("C:/library-b/b.stl")]).toBeUndefined();
  });

  it("prefers portable metadata over legacy and mirror data", async () => {
    const root = path.resolve("C:/library");
    const portablePath = path.join(root, "model.stl");
    const harness = createHarness({
      initialPortable: new Map([
        [
          root.toLowerCase(),
          encodePortableMetadata(root, "portable-id", metadataWithNote(portablePath, "portable"))
        ]
      ]),
      legacy: metadataWithNote(portablePath, "legacy"),
      mirrorRecords: [
        {
          rootPath: root,
          libraryId: "mirror-id",
          updatedAt: "2026-09-09T09:00:00.000Z",
          metadata: metadataWithNote(portablePath, "mirror")
        }
      ]
    });

    await harness.store.open(root);

    expect(harness.store.getMetadata().models[portablePath].notes).toBe("portable");
    expect(harness.store.getLibraryId()).toBe("portable-id");
    expect(harness.store.getStatus()).toMatchObject({ source: "primary", writable: true });
  });

  it("generates one identity when a new library has no metadata or mirror identity", async () => {
    const createLibraryId = vi.fn(() => "generated-once");
    const harness = createHarness({ createLibraryId });

    expect(harness.store.getLibraryId()).toBeNull();
    await harness.store.open("C:/library");
    expect(harness.store.getLibraryId()).toBe("generated-once");

    await harness.store.open("C:/library");
    expect(harness.store.getLibraryId()).toBe("generated-once");
    expect(createLibraryId).toHaveBeenCalledOnce();
  });

  it("migrates only legacy paths inside the selected root and only once", async () => {
    const root = path.resolve("C:/library");
    const insidePath = path.join(root, "inside.stl");
    const outsidePath = path.resolve("C:/other/outside.stl");
    const legacyStore = createLibraryMetadataStore();
    legacyStore.setNotes(insidePath, "inside");
    legacyStore.setNotes(outsidePath, "outside");
    legacyStore.addCatalogTag("cosplay");
    legacyStore.recordSlicerOpen(insidePath, "cura", "2026-09-09T10:00:00.000Z");
    legacyStore.recordSlicerOpen(outsidePath, "cura", "2026-09-09T11:00:00.000Z");
    const harness = createHarness({ legacyStore });

    await harness.store.open(root);
    expect(harness.store.getStatus().source).toBe("legacy");
    expect(harness.store.getMetadata().models[insidePath].notes).toBe("inside");
    expect(harness.store.getMetadata().models[outsidePath]).toBeUndefined();
    expect(harness.store.getMetadata().slicerHistory).toHaveLength(1);
    expect(legacyStore.getMetadata().models[outsidePath].notes).toBe("outside");

    await harness.store.open(root);
    expect(harness.store.getStatus().source).toBe("primary");
    expect(harness.repository.saveCount).toBe(1);
  });

  it("does not copy legacy catalog tags into unrelated libraries", async () => {
    const rootA = path.resolve("C:/library-a");
    const rootB = path.resolve("C:/library-b");
    const harness = createHarness({
      legacy: {
        models: {
          [path.join(rootA, "a.stl")]: { favorite: false, tags: ["alpha"], notes: "" },
          [path.join(rootB, "b.stl")]: { favorite: false, tags: ["beta"], notes: "" }
        },
        tagCatalog: ["alpha", "beta", "orphan"],
        slicerHistory: []
      }
    });

    await harness.store.open(rootA);
    expect(harness.store.getMetadata().tagCatalog).toEqual(["alpha"]);
    await harness.store.open(rootB);
    expect(harness.store.getMetadata().tagCatalog).toEqual(["beta"]);
    await harness.store.open("C:/library-c");
    expect(harness.store.getMetadata().tagCatalog).toEqual([]);
  });

  it("serializes concurrent mutations without losing either change", async () => {
    const harness = createHarness({ saveDelayMs: 10 });
    await harness.store.open("C:/library");
    const modelPath = path.resolve("C:/library/a.stl");

    const favorite = harness.store.toggleFavorite(modelPath);
    const notes = harness.store.setNotes(modelPath, "print slow");
    await Promise.all([favorite, notes]);

    expect(harness.store.getMetadata().models[modelPath]).toMatchObject({
      favorite: true,
      notes: "print slow"
    });
    expect(harness.repository.maxConcurrentSaves).toBe(1);
  });

  it("accepts names beginning with two dots but rejects parent traversal segments", async () => {
    const root = path.resolve("C:/library");
    const harness = createHarness();
    await harness.store.open(root);

    await expect(harness.store.setNotes(path.join(root, "..draft", "part.stl"), "valid"))
      .resolves.toBeDefined();
    await expect(harness.store.setNotes(path.join(root, "..", "outside.stl"), "invalid"))
      .rejects.toThrow(/não pertence/i);
  });

  it("does not expose a mutation when the portable save fails", async () => {
    const harness = createHarness();
    await harness.store.open("C:/library");
    const modelPath = path.resolve("C:/library/a.stl");
    harness.repository.failNextSave = true;

    await expect(harness.store.toggleFavorite(modelPath)).rejects.toThrow("disk full");
    expect(harness.store.getMetadata().models[modelPath]).toBeUndefined();
  });

  it("uses mirror data for a missing library but blocks edits", async () => {
    const root = path.resolve("C:/missing-library");
    const modelPath = path.join(root, "a.stl");
    const harness = createHarness({
      missingRoots: new Set([root.toLowerCase()]),
      mirrorRecords: [
        {
          rootPath: root,
          libraryId: "mirror-id",
          updatedAt: "2026-09-09T10:00:00.000Z",
          metadata: metadataWithNote(modelPath, "cached note")
        }
      ]
    });

    await harness.store.open(root);

    expect(harness.store.getMetadata().models[modelPath].notes).toBe("cached note");
    expect(harness.store.getLibraryId()).toBe("mirror-id");
    expect(harness.store.getStatus()).toMatchObject({
      availability: "unavailable",
      writable: false,
      source: "mirror"
    });
    await expect(harness.store.setNotes(modelPath, "new note")).rejects.toThrow(/dispon/i);
  });

  it("loads a readable library in read-only mode and blocks durable edits", async () => {
    const root = path.resolve("C:/read-only-library");
    const modelPath = path.join(root, "a.stl");
    const harness = createHarness({
      readOnlyRoots: new Set([root.toLowerCase()]),
      initialPortable: new Map([
        [root.toLowerCase(), encodePortableMetadata(root, "id", metadataWithNote(modelPath, "saved"))]
      ])
    });

    await harness.store.open(root);

    expect(harness.store.getMetadata().models[modelPath].notes).toBe("saved");
    expect(harness.store.getStatus()).toMatchObject({
      availability: "read-only",
      writable: false,
      source: "primary"
    });
    await expect(harness.store.toggleFavorite(modelPath)).rejects.toThrow(/alter|permite/i);
  });

  it("loads backup with a warning and clears recovery state after a successful edit", async () => {
    const root = path.resolve("C:/library");
    const modelPath = path.join(root, "a.stl");
    const harness = createHarness({
      initialPortable: new Map([
        [root.toLowerCase(), encodePortableMetadata(root, "id", metadataWithNote(modelPath, "backup"))]
      ]),
      backupRoots: new Set([root.toLowerCase()])
    });

    await harness.store.open(root);
    expect(harness.store.getStatus()).toMatchObject({ source: "backup", writable: true });
    expect(harness.store.getStatus().message).toMatch(/backup/i);

    await harness.store.setNotes(modelPath, "repaired");
    expect(harness.store.getStatus()).toMatchObject({ source: "primary", message: null });
    expect(harness.repository.lastSaveOptions).toMatchObject({
      corruptPrimaryPath: expect.any(String)
    });
  });

  it("moves nested metadata and slicer history before persisting", async () => {
    const root = path.resolve("C:/library");
    const sourceFolder = path.join(root, "raw");
    const destinationFolder = path.join(root, "sorted", "raw");
    const oldModelPath = path.join(sourceFolder, "sub", "part.3mf");
    const nextModelPath = path.join(destinationFolder, "sub", "part.3mf");
    const harness = createHarness();
    await harness.store.open(root);
    await harness.store.setNotes(oldModelPath, "keep me");
    await harness.store.recordSlicerOpen(oldModelPath, "cura", "2026-09-09T10:00:00.000Z");

    await harness.store.movePathMetadata(sourceFolder, destinationFolder);

    expect(harness.store.getMetadata().models[nextModelPath].notes).toBe("keep me");
    expect(harness.store.getMetadata().slicerHistory[0].modelPath).toBe(nextModelPath);
    const persisted = decodePortableMetadata(root, harness.repository.lastSavedManifest!);
    expect(persisted.metadata.models[nextModelPath].notes).toBe("keep me");
  });

  it("serializes restore after pending edits and adopts the active library identity", async () => {
    const root = path.resolve("C:/library");
    const modelPath = path.join(root, "part.stl");
    const harness = createHarness({ saveDelayMs: 5 });
    await harness.store.open(root);
    const foreign = encodePortableMetadata(
      root,
      "foreign-library",
      metadataWithNote(modelPath, "restored note"),
      "2026-09-08T10:00:00.000Z"
    );

    const pendingEdit = harness.store.setNotes(modelPath, "pending note");
    const restore = harness.store.restoreManifest(foreign);
    await Promise.all([pendingEdit, restore]);

    expect(harness.repository.lastRestoredCurrent?.models["part.stl"]?.notes).toBe("pending note");
    expect(harness.repository.lastRestoredReplacement).toMatchObject({
      libraryId: "generated-id",
      updatedAt: "2026-09-09T12:00:00.000Z"
    });
    expect(harness.store.getMetadata().models[modelPath].notes).toBe("restored note");
    expect(harness.store.getDataStatus()).toMatchObject({
      libraryId: "generated-id",
      updatedAt: "2026-09-09T12:00:00.000Z",
      modelCount: 1
    });
  });

  it("keeps current metadata when repository restore fails", async () => {
    const root = path.resolve("C:/library");
    const modelPath = path.join(root, "part.stl");
    const harness = createHarness();
    await harness.store.open(root);
    await harness.store.setNotes(modelPath, "current note");
    harness.repository.failNextRestore = true;
    const replacement = encodePortableMetadata(
      root,
      "foreign-library",
      metadataWithNote(modelPath, "lost note")
    );

    await expect(harness.store.restoreManifest(replacement)).rejects.toThrow("restore failed");
    expect(harness.store.getMetadata().models[modelPath].notes).toBe("current note");
  });
});

type HarnessOptions = {
  initialPortable?: Map<string, PortableLibraryManifestV1>;
  missingRoots?: Set<string>;
  backupRoots?: Set<string>;
  readOnlyRoots?: Set<string>;
  legacy?: LibraryMetadata;
  legacyStore?: LibraryMetadataStore;
  mirrorRecords?: LibraryMetadataMirrorRecord[];
  saveDelayMs?: number;
  createLibraryId?: () => string;
};

function createHarness(options: HarnessOptions = {}) {
  const manifests = options.initialPortable ?? new Map<string, PortableLibraryManifestV1>();
  const missingRoots = options.missingRoots ?? new Set<string>();
  const backupRoots = options.backupRoots ?? new Set<string>();
  const readOnlyRoots = options.readOnlyRoots ?? new Set<string>();
  let concurrentSaves = 0;
  let maxConcurrentSaves = 0;
  let saveCount = 0;
  let failNextSave = false;
  let failNextRestore = false;
  let lastSavedManifest: PortableLibraryManifestV1 | null = null;
  let lastSaveOptions: { corruptPrimaryPath?: string | null } | undefined;
  let lastRestoredCurrent: PortableLibraryManifestV1 | null = null;
  let lastRestoredReplacement: PortableLibraryManifestV1 | null = null;
  const repository: ActiveLibraryMetadataStoreOptions["repository"] & {
    maxConcurrentSaves: number;
    saveCount: number;
    failNextSave: boolean;
    lastSavedManifest: PortableLibraryManifestV1 | null;
    lastSaveOptions: { corruptPrimaryPath?: string | null } | undefined;
    failNextRestore: boolean;
    lastRestoredCurrent: PortableLibraryManifestV1 | null;
    lastRestoredReplacement: PortableLibraryManifestV1 | null;
  } = {
    async canonicalizeRoot(rootPath) {
      const normalized = path.resolve(rootPath);
      if (missingRoots.has(normalized.toLowerCase())) throw new Error("missing root");
      return normalized;
    },
    async checkWritable(rootPath) {
      return !readOnlyRoots.has(path.resolve(rootPath).toLowerCase());
    },
    async load(rootPath) {
      const key = path.resolve(rootPath).toLowerCase();
      const manifest = manifests.get(key) ?? null;
      const backup = backupRoots.has(key);
      return {
        manifest,
        source: backup ? "backup" : manifest ? "primary" : "empty",
        warning: backup ? "Recuperado pelo backup." : null,
        corruptPrimaryPath: backup ? path.join(rootPath, ".3d-model-library", "broken.json") : null
      };
    },
    async save(rootPath, manifest, saveOptions) {
      concurrentSaves += 1;
      maxConcurrentSaves = Math.max(maxConcurrentSaves, concurrentSaves);
      try {
        if (options.saveDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.saveDelayMs));
        }
        if (failNextSave) {
          failNextSave = false;
          throw new Error("disk full");
        }
        manifests.set(path.resolve(rootPath).toLowerCase(), structuredClone(manifest));
        lastSavedManifest = structuredClone(manifest);
        lastSaveOptions = saveOptions;
        saveCount += 1;
      } finally {
        concurrentSaves -= 1;
      }
    },
    async readExternalBackup() {
      throw new Error("not used by active store tests");
    },
    async exportBackup() {
      throw new Error("not used by active store tests");
    },
    async restoreBackup(rootPath, currentManifest, replacementManifest) {
      if (failNextRestore) {
        failNextRestore = false;
        throw new Error("restore failed");
      }
      manifests.set(path.resolve(rootPath).toLowerCase(), structuredClone(replacementManifest));
      lastRestoredCurrent = structuredClone(currentManifest);
      lastRestoredReplacement = structuredClone(replacementManifest);
      return { manifest: replacementManifest, snapshotPath: "C:/snapshot.json" };
    },
    async getDataDirectory(rootPath) {
      return path.join(rootPath, ".3d-model-library");
    },
    get maxConcurrentSaves() {
      return maxConcurrentSaves;
    },
    get saveCount() {
      return saveCount;
    },
    get failNextSave() {
      return failNextSave;
    },
    set failNextSave(value: boolean) {
      failNextSave = value;
    },
    get lastSavedManifest() {
      return lastSavedManifest;
    },
    get lastSaveOptions() {
      return lastSaveOptions;
    },
    get failNextRestore() {
      return failNextRestore;
    },
    set failNextRestore(value: boolean) {
      failNextRestore = value;
    },
    get lastRestoredCurrent() {
      return lastRestoredCurrent;
    },
    get lastRestoredReplacement() {
      return lastRestoredReplacement;
    }
  };

  let mirrorValue: unknown = options.mirrorRecords ?? [];
  const mirrorBackend: LibraryMetadataMirrorBackend = {
    get: () => mirrorValue,
    set: (records) => {
      mirrorValue = records;
    }
  };
  const mirror = createLibraryMetadataMirrorStore(mirrorBackend);
  const legacyStore = options.legacyStore ?? createLibraryMetadataStore();
  if (options.legacy) legacyStore.saveMetadata(options.legacy);
  const store = createActiveLibraryMetadataStore({
    repository,
    mirror,
    legacyStore,
    createLibraryId: options.createLibraryId ?? (() => "generated-id"),
    now: () => "2026-09-09T12:00:00.000Z"
  });

  return { store, repository, mirror, legacyStore };
}

function metadataWithNote(modelPath: string, notes: string): LibraryMetadata {
  return {
    models: {
      [modelPath]: { favorite: false, tags: [], notes }
    },
    tagCatalog: [],
    slicerHistory: []
  };
}
