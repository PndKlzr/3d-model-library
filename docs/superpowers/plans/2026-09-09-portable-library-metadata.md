# Portable Library Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist notes, tags, favorites, and slicer history inside each model library, recover safely from damaged writes, and show the selected file's complete location in the details panel.

**Architecture:** Keep the existing in-memory `LibraryMetadataStore` as the pure metadata reducer, then place an asynchronous active-library session around it. A portable codec converts absolute runtime paths to validated relative manifest paths, a file repository performs recoverable writes inside `.3d-model-library`, and the active session owns migration, read-only state, serialization, and the AppData recovery mirror. The renderer receives metadata and a separate status object so existing filters keep their current absolute-path lookup behavior.

**Tech Stack:** Electron 33.2.1, Node.js 22 APIs, TypeScript 5.7, React 18, Vitest 2, electron-store 10, Lucide React.

**Spec:** `docs/superpowers/specs/2026-09-09-portable-library-metadata-design.md`

## Global Constraints

- The portable directory is exactly `.3d-model-library` at the selected library root.
- The primary file is exactly `3D_LIBRARY_DATA_DO_NOT_DELETE.json`; its backup adds `.bak`.
- The manifest schema version is exactly `1`, is UTF-8 JSON, and contains no absolute paths, usernames, slicer executable paths, credentials, settings, thumbnails, hashes, or scan indexes.
- Durable portable fields are model notes, model tags, favorite state, tag catalog, and slicer-open history.
- Machine settings and rebuildable caches remain in Electron application data.
- Portable metadata is authoritative; an AppData mirror is recovery assistance only.
- Writes are serialized and complete through a unique temporary file, flush, valid backup preservation, atomic primary replacement, then mirror update.
- A missing or unwritable library never accepts provisional metadata edits and never reports them as saved.
- The scanner, watcher, sidebar, folder grid, search, counts, drag targets, and archive operations must ignore `.3d-model-library`.
- Existing internal and native external drag behavior must remain unchanged.
- Do not add a runtime dependency for this feature.

---

### Task 1: Portable Manifest Codec And Shared Status

**Files:**
- Create: `electron/services/portableMetadataCodec.ts`
- Modify: `electron/services/libraryMetadataStore.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/portableMetadataCodec.test.ts`

**Interfaces:**
- Produces: `LibraryMetadataStatus` and `LibraryMetadataAvailability` in `src/shared/types.ts`.
- Produces: `PortableLibraryManifestV1`, `PORTABLE_METADATA_DIRECTORY`, `PORTABLE_METADATA_FILENAME`, `MAX_PORTABLE_METADATA_BYTES`, `encodePortableMetadata(rootPath, libraryId, metadata, updatedAt)`, and `decodePortableMetadata(rootPath, value)`.
- `decodePortableMetadata` returns `{ libraryId: string; updatedAt: string; metadata: LibraryMetadata }`, where all model and history paths are absolute runtime paths.

- [x] **Step 1: Add failing codec tests**

Create `tests/unit/portableMetadataCodec.test.ts` with tests that exercise a Windows-style root through `path.resolve`, round-trip tags/notes/favorites/history, and reject unsafe paths:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodePortableMetadata,
  encodePortableMetadata
} from "../../electron/services/portableMetadataCodec";

describe("portableMetadataCodec", () => {
  const rootPath = path.resolve("C:/library");
  const modelPath = path.join(rootPath, "Brinquedos", "ação + teste.3mf");

  it("stores model and history paths relative to the library", () => {
    const manifest = encodePortableMetadata(
      rootPath,
      "library-id",
      {
        models: {
          [modelPath]: { favorite: true, tags: ["Fidget"], notes: "PLA" }
        },
        tagCatalog: ["Fidget"],
        slicerHistory: [
          { modelPath, slicerId: "cura", openedAt: "2026-09-09T10:00:00.000Z" }
        ]
      },
      "2026-09-09T11:00:00.000Z"
    );

    expect(Object.keys(manifest.models)).toEqual(["Brinquedos/ação + teste.3mf"]);
    expect(manifest.slicerHistory[0].relativePath).toBe("Brinquedos/ação + teste.3mf");
    expect(JSON.stringify(manifest)).not.toContain(rootPath);

    const decoded = decodePortableMetadata(rootPath, manifest);
    expect(decoded.metadata.models[modelPath]).toEqual({
      favorite: true,
      tags: ["fidget"],
      notes: "PLA"
    });
    expect(decoded.metadata.slicerHistory[0].modelPath).toBe(modelPath);
  });

  it.each(["C:/outside/model.stl", "../outside.stl", "/absolute.stl"])(
    "rejects unsafe manifest path %s",
    (relativePath) => {
      expect(() =>
        decodePortableMetadata(rootPath, {
          schemaVersion: 1,
          libraryId: "library-id",
          updatedAt: "2026-09-09T11:00:00.000Z",
          tagCatalog: [],
          models: {
            [relativePath]: { favorite: true, tags: [], notes: "" }
          },
          slicerHistory: []
        })
      ).toThrow(/relative|library/i);
    }
  );

  it("rejects an incompatible schema version", () => {
    expect(() => decodePortableMetadata(rootPath, { schemaVersion: 2 })).toThrow(/version/i);
  });
});
```

- [x] **Step 2: Run the codec test and verify it fails**

Run: `npm test -- tests/unit/portableMetadataCodec.test.ts`

Expected: FAIL because `portableMetadataCodec.ts` and its exports do not exist.

- [x] **Step 3: Define the shared metadata status**

Add these types to `src/shared/types.ts`:

```ts
export type LibraryMetadataAvailability = "ready" | "read-only" | "unavailable";

export type LibraryMetadataStatus = {
  availability: LibraryMetadataAvailability;
  writable: boolean;
  source: "primary" | "backup" | "legacy" | "empty" | "mirror";
  message: string | null;
};
```

- [x] **Step 4: Implement the codec with bounded validation**

Create `electron/services/portableMetadataCodec.ts` with these public constants and types:

```ts
export const PORTABLE_METADATA_DIRECTORY = ".3d-model-library";
export const PORTABLE_METADATA_FILENAME = "3D_LIBRARY_DATA_DO_NOT_DELETE.json";
export const MAX_PORTABLE_METADATA_BYTES = 8 * 1024 * 1024;
export const PORTABLE_METADATA_SCHEMA_VERSION = 1;

export type PortableLibraryManifestV1 = {
  schemaVersion: 1;
  libraryId: string;
  updatedAt: string;
  tagCatalog: string[];
  models: Record<string, ModelUserMetadata>;
  slicerHistory: Array<{
    relativePath: string;
    slicerId: string;
    openedAt: string;
  }>;
};

export function encodePortableMetadata(
  rootPath: string,
  libraryId: string,
  metadata: LibraryMetadata,
  updatedAt = new Date().toISOString()
): PortableLibraryManifestV1;

export function decodePortableMetadata(
  rootPath: string,
  value: unknown
): { libraryId: string; updatedAt: string; metadata: LibraryMetadata };
```

Use `path.relative` for encoding and `path.resolve` for decoding. Normalize manifest separators to `/`; reject empty paths, absolute paths, `..` escapes, NUL bytes, model keys over 1024 characters, tags over 80 characters, notes over 20,000 characters, IDs over 120 characters, malformed timestamps, non-object model values, and manifests whose schema is not exactly `1`. Limit the decoded history to the existing 100-entry behavior. Rename and export the existing private `normalizeMetadata` and `cloneMetadata` helpers as `normalizeLibraryMetadata` and `cloneLibraryMetadata`, update the pure reducer to call those names, and reuse them in the codec rather than creating a second normalization implementation.

- [x] **Step 5: Run the codec and existing metadata tests**

Run: `npm test -- tests/unit/portableMetadataCodec.test.ts tests/unit/libraryMetadataStore.test.ts`

Expected: PASS.

- [x] **Step 6: Commit the codec boundary**

```bash
git add electron/services/portableMetadataCodec.ts src/shared/types.ts tests/unit/portableMetadataCodec.test.ts electron/services/libraryMetadataStore.ts
git commit -m "feat: add portable metadata codec"
```

---

### Task 2: Recoverable Portable File Repository

**Files:**
- Create: `electron/services/portableMetadataRepository.ts`
- Test: `tests/unit/portableMetadataRepository.test.ts`

**Interfaces:**
- Consumes: manifest constants, `MAX_PORTABLE_METADATA_BYTES`, `PortableLibraryManifestV1`, and `decodePortableMetadata` from Task 1.
- Produces: `PortableMetadataLoadResult` and `PortableMetadataRepository`.
- Produces: `createPortableMetadataRepository(options?)` with injectable `hideDirectory` and default Windows `attrib +H` behavior.

```ts
export type PortableMetadataLoadResult = {
  manifest: PortableLibraryManifestV1 | null;
  source: "primary" | "backup" | "empty";
  warning: string | null;
  corruptPrimaryPath: string | null;
};

export type PortableMetadataRepository = {
  canonicalizeRoot(rootPath: string): Promise<string>;
  checkWritable(rootPath: string): Promise<boolean>;
  load(rootPath: string): Promise<PortableMetadataLoadResult>;
  save(
    rootPath: string,
    manifest: PortableLibraryManifestV1,
    options?: { corruptPrimaryPath?: string | null }
  ): Promise<void>;
};
```

- [x] **Step 1: Add failing repository tests**

Create integration-style tests using `mkdtemp`, `readFile`, `writeFile`, and `rm` from `node:fs/promises`. Cover: empty library, primary load, writable probing, primary load, valid backup fallback after corrupt primary, manifest size rejection, preservation of the valid backup while repairing a corrupt primary, unique temporary-file cleanup, and write failure propagation. Inject a repository filesystem adapter whose `open` rejects to verify `checkWritable` returns `false` without altering the primary or backup. The recovery assertion must be explicit:

```ts
it("loads a valid backup and preserves corrupt evidence during repair", async () => {
  const root = await makeLibrary();
  const repository = createPortableMetadataRepository({ hideDirectory: async () => undefined });
  const directory = path.join(root, PORTABLE_METADATA_DIRECTORY);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, PORTABLE_METADATA_FILENAME), "{broken", "utf8");
  await writeFile(
    path.join(directory, `${PORTABLE_METADATA_FILENAME}.bak`),
    JSON.stringify(validManifest("backup-id")),
    "utf8"
  );

  const loaded = await repository.load(root);
  expect(loaded.source).toBe("backup");
  expect(loaded.warning).toMatch(/backup/i);
  expect(loaded.corruptPrimaryPath).toBeTruthy();

  await repository.save(root, validManifest("backup-id"), {
    corruptPrimaryPath: loaded.corruptPrimaryPath
  });

  const names = await readdir(directory);
  expect(names.some((name) => name.endsWith(".corrupt"))).toBe(true);
  expect(JSON.parse(await readFile(path.join(directory, `${PORTABLE_METADATA_FILENAME}.bak`), "utf8"))).toMatchObject({ libraryId: "backup-id" });
  expect(JSON.parse(await readFile(path.join(directory, PORTABLE_METADATA_FILENAME), "utf8"))).toMatchObject({ libraryId: "backup-id" });
});
```

- [x] **Step 2: Run the repository test and verify it fails**

Run: `npm test -- tests/unit/portableMetadataRepository.test.ts`

Expected: FAIL because `createPortableMetadataRepository` does not exist.

- [x] **Step 3: Implement bounded reads and backup-aware loads**

Read `stat.size` before `readFile` and reject files over `MAX_PORTABLE_METADATA_BYTES`. Parse primary first. If primary is absent, return `empty`; if it is invalid, try `.bak`. If backup succeeds, return `source: "backup"`, a Portuguese warning, and the primary path as `corruptPrimaryPath`. If both existing files are invalid, throw a clear error that names neither file contents nor user-specific paths.

- [x] **Step 4: Implement the safe write sequence**

For each save:

1. Revalidate the full manifest with `decodePortableMetadata` before writing.
2. Create `.3d-model-library` recursively.
3. Apply Hidden on Windows via `execFile("attrib", ["+H", metadataDirectory])`; treat an `attrib` failure as a warning logged to `console.warn`, not a lost metadata save.
4. Write JSON plus a trailing newline to `${filename}.${randomUUID()}.tmp` using `open(..., "wx")`, `FileHandle.writeFile`, `FileHandle.sync`, and `FileHandle.close` in `finally`.
5. If `corruptPrimaryPath` is set, rename that exact file to `${filename}.${timestamp}.corrupt` before replacement.
6. Copy the current primary to `.bak` only after validating that current primary. Never copy corrupt JSON over a valid backup.
7. Replace the primary with `rename(tempPath, primaryPath)`.
8. Remove any surviving temporary file in `finally`.

The repository must write only paths constructed from the two fixed constants and must compare the resolved metadata directory against the canonical root before every mutation.

Implement `checkWritable` by creating and removing a unique zero-byte probe inside the fixed metadata directory. If the directory does not yet exist, probe the canonical library root instead. Always close and remove the probe in `finally`; return `false` for access, missing-root, and read-only filesystem errors without changing metadata files.

- [x] **Step 5: Run repository tests**

Run: `npm test -- tests/unit/portableMetadataRepository.test.ts`

Expected: PASS, including recovery and temporary-file cleanup.

- [x] **Step 6: Commit the file repository**

```bash
git add electron/services/portableMetadataRepository.ts tests/unit/portableMetadataRepository.test.ts
git commit -m "feat: persist metadata with backup recovery"
```

---

### Task 3: Active Library Session, Legacy Migration, And Mirror

**Files:**
- Create: `electron/services/libraryMetadataMirrorStore.ts`
- Create: `electron/services/activeLibraryMetadataStore.ts`
- Modify: `electron/services/libraryMetadataStore.ts`
- Test: `tests/unit/activeLibraryMetadataStore.test.ts`

**Interfaces:**
- Consumes: `LibraryMetadataStore`, portable codec, and repository from Tasks 1-2.
- Renames: `createElectronLibraryMetadataStore()` to `createLegacyElectronLibraryMetadataStore()`; the legacy store remains readable and is never deleted.
- Produces: `LibraryMetadataMirrorStore` with `getByRoot(rootPath)` and `set(record)`.
- Produces: `ActiveLibraryMetadataStore` whose mutating methods return promises and commit in-memory state only after the portable save succeeds.

```ts
export type LibraryMetadataMirrorRecord = {
  rootPath: string;
  libraryId: string;
  updatedAt: string;
  metadata: LibraryMetadata;
};

export type ActiveLibraryMetadataStore = {
  open(rootPath: string | null): Promise<void>;
  retry(): Promise<void>;
  getMetadata(): LibraryMetadata;
  getStatus(): LibraryMetadataStatus;
  toggleFavorite(modelPath: string): Promise<LibraryMetadata>;
  setTags(modelPath: string, tags: string[]): Promise<LibraryMetadata>;
  setNotes(modelPath: string, notes: string): Promise<LibraryMetadata>;
  addCatalogTag(tag: string): Promise<LibraryMetadata>;
  removeCatalogTag(tag: string): Promise<LibraryMetadata>;
  movePathMetadata(sourcePath: string, destinationPath: string): Promise<LibraryMetadata>;
  recordSlicerOpen(modelPath: string, slicerId: string, openedAt?: string): Promise<LibraryMetadata>;
};
```

- [x] **Step 1: Add failing active-session tests**

Use in-memory fakes for repository, mirror, and legacy store. Cover these exact behaviors:

- opening two roots keeps their notes and favorites isolated;
- a valid portable manifest wins over legacy and mirror data;
- legacy absolute paths inside the root migrate once while outside paths remain only in legacy;
- backup source exposes a warning until a successful edit repairs primary;
- missing root may display mirror metadata but returns `availability: "unavailable"` and rejects all mutations;
- repository save failure leaves `getMetadata()` unchanged;
- two concurrent note/tag mutations are serialized and both survive;
- moving a folder updates nested model metadata and slicer history before writing the relative manifest.

Use this concurrency shape:

```ts
it("serializes concurrent mutations without losing either change", async () => {
  const { store, repository } = createHarness();
  await store.open("C:/library");

  const favorite = store.toggleFavorite("C:/library/a.stl");
  const notes = store.setNotes("C:/library/a.stl", "print slow");
  await Promise.all([favorite, notes]);

  expect(store.getMetadata().models["C:/library/a.stl"]).toMatchObject({
    favorite: true,
    notes: "print slow"
  });
  expect(repository.maxConcurrentSaves).toBe(1);
});
```

- [x] **Step 2: Run the active-session test and verify it fails**

Run: `npm test -- tests/unit/activeLibraryMetadataStore.test.ts`

Expected: FAIL because the session and mirror modules do not exist.

- [x] **Step 3: Preserve the old AppData store as the legacy source**

In `libraryMetadataStore.ts`, rename only the Electron factory:

```ts
export async function createLegacyElectronLibraryMetadataStore(): Promise<LibraryMetadataStore>
```

Keep its electron-store name exactly `library-metadata`, so pre-format installations can still be migrated. Reuse the `normalizeLibraryMetadata` and `cloneLibraryMetadata` exports introduced in Task 1 while preserving the current reducer tests and synchronous pure-store API.

- [x] **Step 4: Implement the AppData mirror**

Use a separate electron-store named `library-metadata-mirror`, keyed by a normalized lowercase root path. Store a clone of the absolute-path runtime metadata plus `libraryId` and `updatedAt`. The mirror factory must also accept an in-memory backend for tests. Never write to the mirror before the portable repository save succeeds.

- [x] **Step 5: Implement active-library opening and migration**

`open(rootPath)` must first drain the current mutation queue, reset active state, and then:

1. Return empty/unavailable for `null`.
2. Canonicalize an existing root with repository `canonicalizeRoot`.
3. Load primary or backup and decode it if present, then call `repository.checkWritable(canonicalRoot)` before exposing editable controls.
4. If absent, filter legacy models and history with `path.relative(canonicalRoot, candidate)`; copy only paths that remain inside the root.
5. Persist migrated or empty metadata immediately with a new `randomUUID()` library ID.
6. If the write probe fails or persistence fails because the directory is unwritable, keep the loaded data visible with `availability: "read-only"`, `writable: false`, and a clear message.
7. If canonicalization fails because the root is missing, load a matching mirror for display, set `source: "mirror"`, and keep all mutations disabled.

If both primary and backup are invalid, retain both files, fall back to matching mirror data only for display, and expose read-only status with a corruption warning. Do not use legacy data to overwrite evidence from a library that already has corrupt portable files.

The portable file wins whenever it exists. Reopening after migration sees the primary and therefore cannot duplicate tags or history.

- [x] **Step 6: Implement serialized transactional mutations**

Maintain one promise tail per session generation. Each mutation must:

```ts
return enqueue(async () => {
  assertWritable();
  assertAbsolutePathInsideActiveRoot(modelPath);
  const reducer = createLibraryMetadataStore();
  reducer.saveMetadata(currentMetadata);
  const nextMetadata = reducer.setNotes(modelPath, notes);
  const manifest = encodePortableMetadata(activeRoot, libraryId, nextMetadata);
  await repository.save(activeRoot, manifest, { corruptPrimaryPath });
  await mirror.set({ rootPath: activeRoot, libraryId, updatedAt: manifest.updatedAt, metadata: nextMetadata });
  currentMetadata = nextMetadata;
  corruptPrimaryPath = null;
  return cloneLibraryMetadata(currentMetadata);
});
```

Use the same transaction helper for every mutation, including path moves and slicer history. A failed portable save must reject, skip the mirror, and leave `currentMetadata` untouched. `retry()` reopens the current requested root and is the only explicit permission/connectivity retry path.

- [x] **Step 7: Run active-session and reducer tests**

Run: `npm test -- tests/unit/activeLibraryMetadataStore.test.ts tests/unit/libraryMetadataStore.test.ts tests/unit/portableMetadataCodec.test.ts tests/unit/portableMetadataRepository.test.ts`

Expected: PASS.

- [x] **Step 8: Commit the active session**

```bash
git add electron/services/libraryMetadataStore.ts electron/services/libraryMetadataMirrorStore.ts electron/services/activeLibraryMetadataStore.ts tests/unit/activeLibraryMetadataStore.test.ts
git commit -m "feat: bind portable metadata to active library"
```

---

### Task 4: Main Process And Preload Integration

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/preload.d.ts`
- Modify: `src/shared/types.ts`
- Modify: `tests/unit/preloadContract.test.ts`
- Modify: `tests/unit/interactionFlowContract.test.ts`

**Interfaces:**
- Consumes: `ActiveLibraryMetadataStore` from Task 3.
- Adds preload calls: `getLibraryMetadataStatus(): Promise<LibraryMetadataStatus>` and `retryLibraryMetadata(): Promise<LibraryMetadataStatus>`.
- Keeps existing metadata method names and renderer-facing `Promise<LibraryMetadata>` return values.

- [x] **Step 1: Add failing IPC contract assertions**

Extend `preloadContract.test.ts` to require both bridge functions and exact channels:

```ts
expect(preloadSource).toContain("getLibraryMetadataStatus");
expect(preloadSource).toContain('ipcRenderer.invoke("metadata:status")');
expect(preloadSource).toContain("retryLibraryMetadata");
expect(preloadSource).toContain('ipcRenderer.invoke("metadata:retry")');
```

Extend `interactionFlowContract.test.ts` to assert `settings:save` awaits metadata activation when `libraryPath` changes and that metadata move/history calls are awaited.

- [x] **Step 2: Run contract tests and verify they fail**

Run: `npm test -- tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts`

Expected: FAIL on missing status/retry APIs and synchronous metadata calls.

- [x] **Step 3: Initialize and bind the active store before creating the window**

Replace the global `LibraryMetadataStore` with `ActiveLibraryMetadataStore`. During `app.whenReady()` create the legacy store, mirror, portable repository, and active store, then call:

```ts
await libraryMetadataStore.open(settingsStore.getSettings().libraryPath);
```

Do this before `registerIpcHandlers()` and `createWindow()`, so the renderer's initial metadata request cannot race initialization.

- [x] **Step 4: Make library changes transactional at the settings boundary**

Change `settings:save` to an async handler. Save settings, compare normalized old/new library paths, close monitoring before a root change, await `libraryMetadataStore.open(saved.libraryPath)`, then restore monitoring according to saved settings. If metadata activation fails, retain the selected path but expose read-only/unavailable status; do not silently bind metadata from the previous root.

- [x] **Step 5: Convert metadata IPC and file-operation hooks to async**

Await every metadata mutation handler. Convert `movePathMetadataSafely` to:

```ts
async function movePathMetadataSafely(
  sourcePath: string,
  destinationPath: string
): Promise<string[]>;
```

Await it from move, folder move, rename, and restore handlers. After a successful slicer launch, await all `recordSlicerOpen` calls; if history persistence fails, keep the slicer result successful and append a warning that recent-open history was not saved. Add:

```ts
ipcMain.handle("metadata:status", () => libraryMetadataStore.getStatus());
ipcMain.handle("metadata:retry", async () => {
  await libraryMetadataStore.retry();
  return libraryMetadataStore.getStatus();
});
```

- [x] **Step 6: Extend the typed preload bridge**

Add `LibraryMetadataStatus` to imports and both methods to `ModelLibraryApi`; expose the matching `ipcRenderer.invoke` calls in `preload.cjs`. Keep context isolation enabled and do not expose filesystem primitives.

- [x] **Step 7: Run the IPC contracts and build**

Run: `npm test -- tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts`

Run: `npm run build`

Expected: both commands PASS.

- [x] **Step 8: Commit the Electron integration**

```bash
git add electron/main.ts electron/preload.cjs src/shared/preload.d.ts src/shared/types.ts tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts
git commit -m "feat: integrate portable metadata lifecycle"
```

---

### Task 5: Hide Internal Metadata From Scans And Monitoring

**Files:**
- Modify: `electron/services/libraryScanner.ts`
- Modify: `electron/services/libraryWatcher.ts`
- Modify: `tests/unit/libraryScanner.test.ts`
- Modify: `tests/unit/libraryWatcher.test.ts`

**Interfaces:**
- Consumes: `PORTABLE_METADATA_DIRECTORY` from Task 1.
- Produces: `isInternalLibraryPath(rootPath, candidatePath): boolean` in `portableMetadataCodec.ts`, shared by scanner and watcher.

- [x] **Step 1: Add failing scanner and watcher exclusions**

Add a scanner test that creates `.3d-model-library/nested/hidden.stl` and the JSON manifest, then confirms neither the folder nor model appears:

```ts
expect(result.folders).not.toContain(".3d-model-library");
expect(result.models.map((model) => model.name)).not.toContain("hidden.stl");
```

Add watcher tests that emit `add`, `change`, `unlink`, `addDir`, and `unlinkDir` beneath the internal directory and assert `onBatch` is never called. Add an `applyLibraryWatchEvents` test confirming a defensive injected internal event is ignored.

- [x] **Step 2: Run scanner/watcher tests and verify they fail**

Run: `npm test -- tests/unit/libraryScanner.test.ts tests/unit/libraryWatcher.test.ts`

Expected: FAIL because the scanner currently recurses into every directory and the watcher accepts internal directory events.

- [x] **Step 3: Exclude the internal tree at every boundary**

In `scanDirectory`, return before adding a folder or calling `readdir` when `isInternalLibraryPath(rootPath, directoryPath)` is true. In `applyLibraryWatchEvents`, skip internal candidates before mutating models/folders. In `createLibraryWatcher.schedule`, skip candidates beneath the internal directory before extension checks and before adding pending events. Also pass Chokidar an `ignored` callback for the same path so metadata writes do not wake the watcher at all.

- [x] **Step 4: Run scanner/watcher and performance tests**

Run: `npm test -- tests/unit/libraryScanner.test.ts tests/unit/libraryWatcher.test.ts tests/unit/performanceContract.test.ts`

Expected: PASS, with no metadata-directory events or count changes.

- [x] **Step 5: Commit the exclusions**

```bash
git add electron/services/portableMetadataCodec.ts electron/services/libraryScanner.ts electron/services/libraryWatcher.ts tests/unit/libraryScanner.test.ts tests/unit/libraryWatcher.test.ts
git commit -m "fix: exclude internal metadata from library views"
```

---

### Task 6: Read-Only And Missing-Library Renderer Flow

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/DetailsPanel.tsx`
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/components/TagSelector.tsx`
- Modify: `src/styles.css`
- Modify: `tests/unit/interactionFlowContract.test.ts`
- Modify: `tests/unit/productFlowContract.test.ts`

**Interfaces:**
- Consumes: `LibraryMetadataStatus`, `getLibraryMetadataStatus()`, and `retryLibraryMetadata()` from Task 4.
- Adds `metadataWritable: boolean` to `DetailsPanelProps`, `SettingsDialog` tag controls, and `TagSelector` through its existing disabled-control convention.

- [ ] **Step 1: Add failing UI contract tests**

Require `App.tsx` to load metadata status alongside settings/metadata, refresh both metadata and status after a library change, catch rejected metadata mutations, and expose a retry action. Require `DetailsPanel.tsx` to disable favorite, tag, and notes controls when `metadataWritable` is false. Require the context-menu favorite/tag actions and Settings tag creation/removal to use the same condition.

- [ ] **Step 2: Run UI contract tests and verify they fail**

Run: `npm test -- tests/unit/interactionFlowContract.test.ts tests/unit/productFlowContract.test.ts`

Expected: FAIL because metadata status is not represented in renderer state.

- [ ] **Step 3: Load and refresh status with library data**

Initialize renderer state with:

```ts
const [metadataStatus, setMetadataStatus] = useState<LibraryMetadataStatus>({
  availability: "unavailable",
  writable: false,
  source: "empty",
  message: "Biblioteca ainda não conectada."
});
```

Load settings, metadata, and status together at startup. After `saveSettings` changes `libraryPath`, fetch both metadata and status before re-enabling the library UI. Do the same after `retryLibraryMetadata`.

- [ ] **Step 4: Make metadata mutations report real outcomes**

Wrap favorite, tag, note, catalog-tag, and path-metadata-triggering flows with `try/catch`. Update local metadata only with the resolved result. On rejection, keep current state and set `operationMessage` to `Não foi possível salvar os dados da biblioteca: ${readErrorMessage(error)}`. Do not optimistically change favorite/tag/note state.

- [ ] **Step 5: Disable durable edits without blocking model use**

Pass `metadataStatus.writable` into details, tag picker, settings, and model context menu. Disable favorite, tag, note, add/remove catalog tag controls and add a tooltip that uses `metadataStatus.message`. Keep preview, Explorer reveal, conversion, archive extraction, native drag, and slicer launch available when the underlying model file is readable. When slicer history cannot be written, show the main-process warning but do not undo a successful slicer launch.

- [ ] **Step 6: Add a compact recovery notice**

Above the details tabs, render a restrained warning only when status is not ready or has a recovery message. Include a `Tentar novamente` button calling `retryLibraryMetadata`. Use the existing `.notice.warning` visual language and ensure it wraps inside the fixed details width.

- [ ] **Step 7: Run UI contracts and build**

Run: `npm test -- tests/unit/interactionFlowContract.test.ts tests/unit/productFlowContract.test.ts tests/unit/layoutContract.test.ts`

Run: `npm run build`

Expected: PASS with no TypeScript prop or preload errors.

- [ ] **Step 8: Commit the read-only flow**

```bash
git add src/App.tsx src/components/DetailsPanel.tsx src/components/SettingsDialog.tsx src/components/TagSelector.tsx src/styles.css tests/unit/interactionFlowContract.test.ts tests/unit/productFlowContract.test.ts
git commit -m "feat: show portable metadata availability"
```

---

### Task 7: File Location, Copy Path, And Explorer Reveal

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/preload.d.ts`
- Modify: `src/components/DetailsPanel.tsx`
- Modify: `src/styles.css`
- Modify: `tests/unit/preloadContract.test.ts`
- Modify: `tests/unit/interactionFlowContract.test.ts`

**Interfaces:**
- Adds preload call: `copyText(text: string): Promise<void>` through `system:copy-text`.
- Reuses: `showModelInFolder(absolutePath)` and its existing library-bound path validation.
- Adds `Copy` and `FolderSearch` Lucide icons to the details information row.

- [ ] **Step 1: Add failing path action contracts**

Extend preload tests for `copyText` and its exact channel. Extend the details contract to require the `Localização` label, the computed relative path including filename, copy action, and Explorer reveal action in the info tab.

- [ ] **Step 2: Run contract tests and verify they fail**

Run: `npm test -- tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts`

Expected: FAIL on missing `copyText` and location row.

- [ ] **Step 3: Add a narrow clipboard boundary**

Import Electron `clipboard` in `main.ts` and register:

```ts
ipcMain.handle("system:copy-text", (_event, value: string) => {
  if (typeof value !== "string" || value.length > 4096 || value.includes("\0")) {
    throw new Error("Texto inválido para copiar.");
  }
  clipboard.writeText(value);
});
```

Expose only `copyText`, not the clipboard object. Add the matching typed preload signature.

- [ ] **Step 4: Add the complete location row**

Compute:

```ts
const relativeLocation = model
  ? [model.relativeFolder, model.name].filter(Boolean).join("/")
  : "";
```

Add a `Localização` definition-list row after `Pasta`. Set the value and its wrapper `title` to `model.absolutePath`. Place two icon-only buttons beside the path: copy calls `window.modelLibrary.copyText(model.absolutePath)` and reveal calls `onShowModelInFolder(model.absolutePath)`. Use `aria-label` and `title` values `Copiar caminho completo` and `Mostrar no Explorer`. Remove the duplicate text-based Explorer action from the Actions tab so the command has one predictable home.

- [ ] **Step 5: Style long paths without resizing the panel**

Add a two-column `.metadata-location-value` layout with `min-width: 0`; use `overflow-wrap: anywhere` for the path and stable 30px icon buttons. At the root, show only the filename. Preserve the absolute path in the native tooltip.

- [ ] **Step 6: Run location contracts, layout tests, and build**

Run: `npm test -- tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts tests/unit/layoutContract.test.ts`

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit the location UI**

```bash
git add electron/main.ts electron/preload.cjs src/shared/preload.d.ts src/components/DetailsPanel.tsx src/styles.css tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts
git commit -m "feat: show and copy model location"
```

---

### Task 8: Full Regression, Documentation, And Portability Check

**Files:**
- Modify: `README.md`
- Create: `tests/unit/portableMetadataSecurity.test.ts`
- Modify: `tests/unit/productFlowContract.test.ts`

**Interfaces:**
- Verifies all interfaces produced in Tasks 1-7 without adding a new production API.

- [ ] **Step 1: Add cross-boundary security tests**

Create `portableMetadataSecurity.test.ts` to verify: oversized JSON is rejected before parsing; absolute/traversal paths cannot be decoded; model paths outside the active root cannot be mutated; library switching waits for queued writes; portable JSON does not contain a configured slicer path, theme preference, Windows username, thumbnail URL, or model hash. Build a representative metadata/settings fixture and assert forbidden strings are absent from serialized JSON.

- [ ] **Step 2: Run the security test and verify it exposes any missing guards**

Run: `npm test -- tests/unit/portableMetadataSecurity.test.ts`

Expected before final hardening: FAIL on any guard omitted by Tasks 1-7; otherwise PASS and continue without manufacturing a failure.

- [ ] **Step 3: Harden only the failing boundaries**

Make the smallest changes required by the concrete failing assertions. Keep authorization for file operations based on current renderer requests plus existing main-process root validation; never derive a file operation target from an untrusted manifest entry alone.

- [ ] **Step 4: Document storage and backup behavior**

Add a `Dados e backup` section to `README.md` stating in Portuguese:

- notes, tags, favorites, and recent slicer history live in `.3d-model-library/3D_LIBRARY_DATA_DO_NOT_DELETE.json`;
- the folder is hidden but must travel with the STL/3MF library during backup or copying;
- `.bak` is automatic recovery, not a second library;
- slicer paths, preferences, thumbnails, and indexes remain local to Windows;
- metadata editing is blocked while the library is disconnected or read-only;
- the old AppData metadata file is retained after migration.

- [ ] **Step 5: Run the entire automated baseline**

Run: `npm test`

Run: `npm run build`

Expected: every existing and new unit/contract test passes; Electron and renderer builds complete without warnings promoted to errors.

- [ ] **Step 6: Perform the manual portability and recovery checks**

Use two temporary model-library folders, not the user's live library:

1. Add a note, two tags, a favorite, and open one model in a slicer.
2. Close the app and verify the primary JSON contains relative paths only.
3. Copy the whole test library to a different absolute path and select it in the app.
4. Confirm note, tags, favorite, and recent-open state follow the copied model.
5. Corrupt only the copied primary JSON, restart, and confirm backup recovery warning appears.
6. Edit one note, restart, and confirm repaired primary plus timestamped `.corrupt` evidence exist.
7. Temporarily rename the copied library root, reopen the app, and confirm cached models remain visible while metadata edits are disabled.
8. Restore the root, use `Tentar novamente`, and confirm edits become available.
9. Confirm `.3d-model-library` never appears in the sidebar, grid, search, counts, or watcher refresh activity.
10. Recheck internal folder drag and native external drag to Cura/Creality Print.

- [ ] **Step 7: Inspect repository hygiene**

Run: `git status --short`

Run: `git diff --check`

Expected: only intentional files are changed and `git diff --check` prints nothing.

- [ ] **Step 8: Commit documentation and final coverage**

```bash
git add README.md tests/unit/portableMetadataSecurity.test.ts tests/unit/productFlowContract.test.ts
git commit -m "docs: explain portable library backups"
```
