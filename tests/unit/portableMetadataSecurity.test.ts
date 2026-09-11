import path from "node:path";
import os from "node:os";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createActiveLibraryMetadataStore } from "../../electron/services/activeLibraryMetadataStore";
import { createLibraryMetadataMirrorStore } from "../../electron/services/libraryMetadataMirrorStore";
import { createLibraryMetadataStore } from "../../electron/services/libraryMetadataStore";
import {
  decodePortableMetadata,
  encodePortableMetadata,
  type PortableLibraryManifestV1
} from "../../electron/services/portableMetadataCodec";
import { createPortableMetadataRepository } from "../../electron/services/portableMetadataRepository";
import { decodeLibraryIndex, encodeLibraryIndex } from "../../electron/services/libraryIndexCodec";
import type { LibraryScanResult } from "../../src/shared/types";

describe("portable metadata security", () => {
  it("rejects traversal and absolute paths in the rebuildable index", () => {
    const root = path.resolve("C:/library");
    const absolutePath = path.join(root, "part.stl");
    const result: LibraryScanResult = {
      rootPath: root,
      folders: [],
      errors: [],
      models: [{ id: absolutePath, name: "part.stl", extension: ".stl", absolutePath,
        relativeFolder: "", sizeBytes: 1, modifiedAt: "2026-09-09T00:00:00.000Z",
        dimensionsMm: null, objectCount: null, previewError: null }]
    };
    const manifest = encodeLibraryIndex(root, result, "library-1");

    for (const relativePath of ["../outside.stl", "C:/outside.stl", "/outside.stl"]) {
      expect(() => decodeLibraryIndex(root, {
        ...manifest,
        files: [{ ...manifest.files[0], relativePath }]
      })).toThrow(/escape|relative/i);
    }
  });

  it("does not serialize machine settings, caches, or the absolute library root", () => {
    const root = path.resolve("C:/Users/PrivateUser/Desktop/Models");
    const modelPath = path.join(root, "Props", "part.stl");
    const metadataWithUntrustedExtras = {
      models: {
        [modelPath]: { favorite: true, tags: ["prop"], notes: "print slow" }
      },
      tagCatalog: ["prop"],
      slicerHistory: [],
      slicerExecutablePath: "C:/Program Files/Cura/Cura.exe",
      theme: "dark",
      thumbnail: "data:image/webp;base64,private",
      hash: "secret-hash"
    };

    const serialized = JSON.stringify(
      encodePortableMetadata(root, "library-id", metadataWithUntrustedExtras, "2026-09-09T10:00:00.000Z")
    );

    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain("PrivateUser");
    expect(serialized).not.toContain("Cura.exe");
    expect(serialized).not.toContain("data:image");
    expect(serialized).not.toContain("secret-hash");
    expect(serialized).toContain("Props/part.stl");
  });

  it.each(["../outside.stl", "C:/outside.stl", "/outside.stl"])(
    "rejects unsafe decoded path %s",
    (unsafePath) => {
      expect(() =>
        decodePortableMetadata(path.resolve("C:/library"), {
          schemaVersion: 1,
          libraryId: "id",
          updatedAt: "2026-09-09T10:00:00.000Z",
          tagCatalog: [],
          models: {
            [unsafePath]: { favorite: false, tags: [], notes: "" }
          },
          slicerHistory: []
        })
      ).toThrow(/relative|library/i);
    }
  );

  it("rejects runtime mutations outside the active root", async () => {
    const harness = createSecurityHarness();
    await harness.store.open("C:/library-a");

    await expect(harness.store.setNotes("C:/library-b/outside.stl", "unsafe")).rejects.toThrow(
      /ativa|library/i
    );
    expect(harness.store.getMetadata().models).toEqual({});
  });

  it("accepts runtime mutations for dot-prefixed names inside the active root", async () => {
    const harness = createSecurityHarness();
    const rootPath = path.resolve("C:/library-a");
    const modelPath = path.join(rootPath, "..draft", "..part.stl");
    await harness.store.open(rootPath);

    await expect(harness.store.setNotes(modelPath, "allowed")).resolves.toBeTruthy();

    expect(harness.store.getMetadata().models[modelPath]?.notes).toBe("allowed");
  });

  it("waits for a pending write before switching libraries", async () => {
    let releasePendingSave = () => undefined;
    const pendingSave = new Promise<void>((resolve) => {
      releasePendingSave = resolve;
    });
    const harness = createSecurityHarness(pendingSave);
    await harness.store.open("C:/library-a");

    const mutation = harness.store.setNotes("C:/library-a/a.stl", "saved before switch");
    await waitFor(() => harness.saveCount() === 2);
    let switchFinished = false;
    const switching = harness.store.open("C:/library-b").then(() => {
      switchFinished = true;
    });
    await Promise.resolve();
    expect(switchFinished).toBe(false);

    releasePendingSave();
    await Promise.all([mutation, switching]);
    expect(harness.store.getMetadata().models).toEqual({});
  });

  it("keeps durable metadata when the whole library moves to a new absolute path", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "portable-library-move-"));
    const sourceRoot = path.join(workspace, "source");
    const copiedRoot = path.join(workspace, "copied");

    try {
      await mkdir(sourceRoot);
      await writeFile(path.join(sourceRoot, "part.stl"), "solid part\nendsolid part");
      let mirrorRecords: unknown = [];
      const store = createActiveLibraryMetadataStore({
        repository: createPortableMetadataRepository({ hideDirectory: async () => undefined }),
        mirror: createLibraryMetadataMirrorStore({
          get: () => mirrorRecords,
          set: (records) => {
            mirrorRecords = records;
          }
        }),
        legacyStore: createLibraryMetadataStore(),
        createLibraryId: () => "portable-library-id"
      });
      await store.open(sourceRoot);
      await store.setNotes(path.join(sourceRoot, "part.stl"), "travels with model");
      await store.setTags(path.join(sourceRoot, "part.stl"), ["portable"]);
      await cp(sourceRoot, copiedRoot, { recursive: true });

      await store.open(copiedRoot);

      expect(store.getMetadata().models[path.join(copiedRoot, "part.stl")]).toMatchObject({
        notes: "travels with model",
        tags: ["portable"]
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function createSecurityHarness(blockedSecondSave?: Promise<void>) {
  const manifests = new Map<string, PortableLibraryManifestV1>();
  let saves = 0;
  const repository = {
    async canonicalizeRoot(rootPath: string) {
      return path.resolve(rootPath);
    },
    async checkWritable() {
      return true;
    },
    async load(rootPath: string) {
      const manifest = manifests.get(path.resolve(rootPath).toLowerCase()) ?? null;
      return {
        manifest,
        source: manifest ? ("primary" as const) : ("empty" as const),
        warning: null,
        corruptPrimaryPath: null
      };
    },
    async save(rootPath: string, manifest: PortableLibraryManifestV1) {
      saves += 1;
      if (saves === 2 && blockedSecondSave) await blockedSecondSave;
      manifests.set(path.resolve(rootPath).toLowerCase(), structuredClone(manifest));
    }
  };
  let mirrorRecords: unknown = [];
  const mirror = createLibraryMetadataMirrorStore({
    get: () => mirrorRecords,
    set: (records) => {
      mirrorRecords = records;
    }
  });
  const store = createActiveLibraryMetadataStore({
    repository,
    mirror,
    legacyStore: createLibraryMetadataStore(),
    createLibraryId: () => `library-${manifests.size + 1}`,
    now: () => "2026-09-09T10:00:00.000Z"
  });

  return { store, saveCount: () => saves };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for test condition");
}
