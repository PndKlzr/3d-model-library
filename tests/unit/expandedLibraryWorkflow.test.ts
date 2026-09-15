import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createActiveLibraryMetadataStore } from "../../electron/services/activeLibraryMetadataStore";
import { createActiveLibrarySession } from "../../electron/services/activeLibrarySession";
import { createLibraryIndexStore } from "../../electron/services/libraryIndexStore";
import { createLibraryMetadataMirrorStore } from "../../electron/services/libraryMetadataMirrorStore";
import { createLibraryMetadataStore } from "../../electron/services/libraryMetadataStore";
import { showLibraryFolder } from "../../electron/services/libraryFolder";
import {
  openLibraryImage,
  readLibraryImageDataUrl
} from "../../electron/services/libraryImage";
import { readLibraryObjPreview } from "../../electron/services/libraryObj";
import { encodePortableMetadata } from "../../electron/services/portableMetadataCodec";
import { createPortableMetadataRepository } from "../../electron/services/portableMetadataRepository";
import { scanLibrary } from "../../electron/services/libraryScanner";
import {
  loadLibraryViewPreferences,
  saveLibraryViewPreferences
} from "../../src/lib/libraryViewPreferences";
import {
  createModelThumbnailService,
  type ModelThumbnailServiceDependencies
} from "../../src/lib/modelThumbnailService";
import { parseObjPreview } from "../../src/lib/objPreview";
import type {
  LibraryMetadata,
  LibrarySessionRef,
  LibraryWatchEvent,
  ModelFile
} from "../../src/shared/types";

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl7nWQAAAAASUVORK5CYII=",
  "base64"
);
const STL_TEXT = "solid fixture\nendsolid fixture\n";
const OBJ_TEXT = "o fixture\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";

const temporaryParents = new Set<string>();

afterEach(async () => {
  const roots = [...temporaryParents];
  temporaryParents.clear();
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("expanded library workflow", () => {
  it("keeps catalog, metadata, preferences, events, and thumbnails isolated through A to B to A", async () => {
    const parent = await createTemporaryParent();
    const rootA = path.join(parent, "library-a");
    const rootB = path.join(parent, "library-b");
    const indexStore = createLibraryIndexStore({ hideDirectory: async () => undefined });
    const repository = createPortableMetadataRepository({
      hideDirectory: async () => undefined
    });
    const storage = createMemoryStorage();
    const seededA = await seedLibrary(rootA, "library-a-id", "tag-a", "excluded-a", indexStore, repository);
    const seededB = await seedLibrary(rootB, "library-b-id", "tag-b", "excluded-b", indexStore, repository);

    saveLibraryViewPreferences(storage, seededA.libraryId, {
      version: 1,
      visibleExtensions: [".stl", ".obj", ".png"],
      excludedFolders: [seededA.excludedFolder]
    });
    saveLibraryViewPreferences(storage, seededB.libraryId, {
      version: 1,
      visibleExtensions: [".obj", ".png"],
      excludedFolders: [seededB.excludedFolder]
    });

    let mirrorRecords: unknown = [];
    const metadataStore = createActiveLibraryMetadataStore({
      repository,
      mirror: createLibraryMetadataMirrorStore({
        get: () => mirrorRecords,
        set: (records) => {
          mirrorRecords = records;
        }
      }),
      legacyStore: createLibraryMetadataStore()
    });
    const scanGateA = deferred<void>();
    const scanGateB = deferred<void>();
    const canonicalRootA = await realpath(rootA);
    const canonicalRootB = await realpath(rootB);
    const scanGates = new Map<string, Array<ReturnType<typeof deferred<void>>>>([
      [canonicalRootA, [scanGateA]],
      [canonicalRootB, [scanGateB]]
    ]);
    const watchers: Array<{
      rootPath: string;
      onBatch: (events: LibraryWatchEvent[]) => void | Promise<void>;
    }> = [];
    const changedEvents = vi.fn();
    const session = createActiveLibrarySession({
      canonicalizeRoot: realpath,
      metadataStore,
      indexStore,
      scanLibrary: async (rootPath) => {
        const gate = scanGates.get(rootPath)?.shift();
        if (gate) await gate.promise;
        return scanLibrary(rootPath);
      },
      createWatcher: ({ rootPath, onBatch }) => {
        watchers.push({ rootPath, onBatch });
        return { close: async () => undefined };
      },
      onChanged: changedEvents
    });

    const imageReads = new Map<string, ReturnType<typeof deferred<string>>>([
      [seededA.libraryId, deferred<string>()],
      [seededB.libraryId, deferred<string>()]
    ]);
    const cacheWrites: Array<{ rootPath: string; sessionKey: string; dataUrl: string }> = [];
    const thumbnailService = createModelThumbnailService(thumbnailDependencies({
      readImageDataUrl: async (expected) => imageReads.get(expected.libraryId)!.promise,
      writeCachedThumbnail: async (model, dataUrl, sessionKey) => {
        cacheWrites.push({ rootPath: path.dirname(model.absolutePath), sessionKey, dataUrl });
      }
    }));

    const activationA = (await session.activate(rootA, true))!;
    expectLibraryActivation(activationA, seededA, storage);
    thumbnailService.beginLibrarySession(activationA.session);
    const thumbnailA = thumbnailService.request(findExtension(activationA.cachedResult!.models, ".png"), "visible");
    await vi.waitFor(() => expect(thumbnailService.getDiagnostics().running.io).toBe(1));
    const scanA = session.scan(activationA.session);
    const switchToB = session.activate(rootB, true);
    await vi.waitFor(() => expect(session.current()).toBeNull());
    scanGateA.resolve(undefined);
    await expect(scanA).rejects.toThrow(/stale session/i);

    const activationB = (await switchToB)!;
    thumbnailService.beginLibrarySession(activationB.session);
    await expect(thumbnailA.promise).resolves.toBeNull();
    expectLibraryActivation(activationB, seededB, storage);
    const thumbnailB = thumbnailService.request(findExtension(activationB.cachedResult!.models, ".png"), "visible");
    await vi.waitFor(() => expect(thumbnailService.getDiagnostics().running.io).toBe(2));
    imageReads.get(seededB.libraryId)!.resolve("data:image/png;base64,Qg==");
    await expect(thumbnailB.promise).resolves.toBe("data:image/png;base64,Qg==");
    expect(cacheWrites).toEqual([{
      rootPath: seededB.rootPath,
      sessionKey: expect.any(String),
      dataUrl: "data:image/png;base64,Qg=="
    }]);
    const scanB = session.scan(activationB.session);
    const staleWatcher = watchers[0];
    const switchBackToA = session.activate(rootA, true);
    await vi.waitFor(() => expect(session.current()).toBeNull());
    scanGateB.resolve(undefined);
    await expect(scanB).rejects.toThrow(/stale session/i);

    const activationAAgain = (await switchBackToA)!;
    thumbnailService.beginLibrarySession(activationAAgain.session);
    const thumbnailAAgain = thumbnailService.request(
      findExtension(activationAAgain.cachedResult!.models, ".png"),
      "visible"
    );
    imageReads.get(seededA.libraryId)!.resolve("data:image/png;base64,QQ==");
    await expect(thumbnailAAgain.promise).resolves.toBe("data:image/png;base64,QQ==");
    await thumbnailService.onIdle();

    await staleWatcher.onBatch([{
      type: "change",
      absolutePath: path.join(staleWatcher.rootPath, "fixture-a.stl")
    }]);
    expect(changedEvents).not.toHaveBeenCalled();
    expect(cacheWrites).toHaveLength(2);
    expect(cacheWrites[1]).toEqual({
      rootPath: seededA.rootPath,
      sessionKey: expect.any(String),
      dataUrl: "data:image/png;base64,QQ=="
    });
    expect(cacheWrites[0].sessionKey).not.toBe(cacheWrites[1].sessionKey);
    expect(cacheWrites.every((write) =>
      write.sessionKey !== `${activationA.session.libraryId}:${activationA.session.generation}:${activationA.session.rootPath}`
    )).toBe(true);
    expectLibraryActivation(activationAAgain, seededA, storage);
    expect(activationAAgain.session.generation).toBeGreaterThan(activationB.session.generation);
    await session.close();
  }, 30_000);

  it("uses real temporary files for bounded image, OBJ, and folder access without opening a GUI", async () => {
    const parent = await createTemporaryParent();
    const root = path.join(parent, "library");
    const nested = path.join(root, "nested");
    const outside = path.join(parent, "outside.png");
    await mkdir(nested, { recursive: true });
    const imagePath = path.join(root, "preview.png");
    const objPath = path.join(root, "shape.obj");
    await writeFile(imagePath, PNG_BYTES);
    await writeFile(objPath, OBJ_TEXT);
    await writeFile(outside, PNG_BYTES);
    const canonicalRoot = await realpath(root);
    const session: LibrarySessionRef = {
      generation: 1,
      libraryId: "temporary-library",
      rootPath: canonicalRoot
    };
    const openPath = vi.fn(async () => "");
    const imageAccess = {
      getCurrentSession: () => session,
      decodeImage: (bytes: Uint8Array) => bytes.byteLength === PNG_BYTES.byteLength,
      openPath
    };

    const dataUrl = await readLibraryImageDataUrl(session, imagePath, imageAccess);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    await openLibraryImage(session, imagePath, imageAccess);
    const objBytes = await readLibraryObjPreview(session, objPath, {
      getCurrentSession: () => session
    });
    const parsed = parseObjPreview(objBytes);
    const revealedPaths: string[] = [];
    const folderAccess = {
      getCurrentSession: () => session,
      openPath: async (target: string) => {
        revealedPaths.push(target);
        return "";
      }
    };
    await showLibraryFolder(session, "", folderAccess);
    await showLibraryFolder(session, "nested", folderAccess);

    expect(openPath).toHaveBeenCalledOnce();
    expect(revealedPaths).toEqual([canonicalRoot, await realpath(nested)]);
    expect(parsed.children.length).toBeGreaterThan(0);
    await expect(readLibraryImageDataUrl(session, outside, imageAccess)).rejects.toThrow(
      /fora da biblioteca/i
    );
  });
});

type SeededLibrary = {
  libraryId: string;
  rootPath: string;
  excludedFolder: string;
  expectedTag: string;
  expectedFavorite: boolean;
  expectedNotes: string;
};

async function seedLibrary(
  rootPath: string,
  libraryId: string,
  expectedTag: string,
  excludedFolder: string,
  indexStore: ReturnType<typeof createLibraryIndexStore>,
  repository: ReturnType<typeof createPortableMetadataRepository>
): Promise<SeededLibrary> {
  await mkdir(path.join(rootPath, excludedFolder), { recursive: true });
  const suffix = libraryId === "library-a-id" ? "a" : "b";
  const stlPath = path.join(rootPath, `fixture-${suffix}.stl`);
  await writeFile(stlPath, STL_TEXT);
  await writeFile(path.join(rootPath, `fixture-${suffix}.obj`), OBJ_TEXT);
  await writeFile(path.join(rootPath, `preview-${suffix}.png`), PNG_BYTES);
  await writeFile(path.join(rootPath, excludedFolder, `hidden-${suffix}.stl`), STL_TEXT);
  const canonicalRoot = await realpath(rootPath);
  const scan = await scanLibrary(canonicalRoot);
  const metadata: LibraryMetadata = {
    models: {
      [stlPath]: { favorite: suffix === "a", tags: [expectedTag], notes: `note-${suffix}` }
    },
    tagCatalog: [expectedTag],
    slicerHistory: []
  };
  await repository.save(
    canonicalRoot,
    encodePortableMetadata(canonicalRoot, libraryId, metadata, "2026-09-12T00:00:00.000Z")
  );
  await indexStore.save(canonicalRoot, libraryId, scan);
  return {
    libraryId,
    rootPath: canonicalRoot,
    excludedFolder,
    expectedTag,
    expectedFavorite: suffix === "a",
    expectedNotes: `note-${suffix}`
  };
}

function expectLibraryActivation(
  activation: {
    session: LibrarySessionRef;
    cachedResult: { rootPath: string; models: ModelFile[] } | null;
    metadata: LibraryMetadata;
  },
  expected: SeededLibrary,
  storage: Pick<Storage, "getItem" | "setItem">
) {
  expect(activation.session).toMatchObject({
    libraryId: expected.libraryId,
    rootPath: expected.rootPath
  });
  expect(activation.cachedResult?.rootPath).toBe(expected.rootPath);
  expect(activation.cachedResult?.models.every((model) =>
    model.absolutePath.startsWith(expected.rootPath)
  )).toBe(true);
  expect(activation.metadata.tagCatalog).toEqual([expected.expectedTag]);
  const modelPath = activation.cachedResult!.models.find((model) => model.extension === ".stl")!
    .absolutePath;
  expect(activation.metadata.models[modelPath]).toEqual({
    favorite: expected.expectedFavorite,
    tags: [expected.expectedTag],
    notes: expected.expectedNotes
  });
  expect(Object.keys(activation.metadata.models)).toEqual([modelPath]);
  expect(loadLibraryViewPreferences(storage, expected.libraryId).excludedFolders).toEqual([
    expected.excludedFolder
  ]);
}

function findExtension(models: ModelFile[], extension: ModelFile["extension"]): ModelFile {
  const result = models.find((model) => model.extension === extension);
  if (!result) throw new Error(`Missing synthetic ${extension} fixture`);
  return result;
}

function thumbnailDependencies(
  overrides: Partial<ModelThumbnailServiceDependencies> = {}
): ModelThumbnailServiceDependencies {
  return {
    readCachedThumbnail: async () => null,
    readEmbeddedThumbnail: async () => null,
    readImageDataUrl: async () => "data:image/png;base64,AA==",
    readObjPreviewFile: async () => new ArrayBuffer(0),
    readModelFile: async () => new ArrayBuffer(0),
    writeCachedThumbnail: async () => undefined,
    renderThumbnail: () => "data:image/webp;base64,AA==",
    renderThumbnailInWorker: async () => null,
    compactImageThumbnail: async (dataUrl) => dataUrl,
    yieldBeforeRender: async () => undefined,
    ...overrides
  };
}

function createMemoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

async function createTemporaryParent() {
  const parent = await mkdtemp(path.join(os.tmpdir(), "model-library-workflow-"));
  temporaryParents.add(parent);
  return parent;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
