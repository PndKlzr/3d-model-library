# Library Switching, Filters, Images, and OBJ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate every selected library and add composable file filters, image browsing, geometry-only OBJ previews, and folder reveal actions without regressing the existing model workflow.

**Architecture:** A main-process active-library session owns one canonical root, generation, metadata store, catalog repository, and watcher. Supported file capabilities and collection filtering remain pure shared/renderer modules; stale generation results are rejected at both the Electron and React boundaries. The library-owned catalog stores relative rebuildable facts, while generated thumbnails remain in the bounded application cache.

**Tech Stack:** Electron 33.2.1, React 18.3.1, TypeScript 5.7.2, Three.js 0.171.0 with `OBJLoader`, Vitest 2.1.8, Node.js filesystem APIs.

**Spec:** `docs/superpowers/specs/2026-09-11-library-switching-filters-images-obj-design.md`

## Global Constraints

- Preserve portable notes, tags, favorites, tag definitions, and slicer history in `.3d-model-library/3D_LIBRARY_DATA_DO_NOT_DELETE.json`.
- Store the rebuildable catalog at `.3d-model-library/LIBRARY_INDEX_DO_NOT_DELETE.json` using relative paths only.
- Keep generated thumbnail images in the application cache, never beside user models.
- Support `.stl`, `.3mf`, `.obj`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.zip`, `.rar`, and `.7z`, case-insensitively.
- Do not load OBJ `.mtl` files or external textures in this phase.
- Never permanently delete a user file; keep Windows Recycle Bin behavior.
- Never accept asynchronous results whose generation or canonical root differs from the active library.
- Keep benchmark runs read-only with respect to the selected model library.
- Preserve internal drag, native external drag, slicer integration, archive extraction, folder mosaics, and the current thumbnail priority model.

---

## File Structure

### New files

- `src/shared/fileCapabilities.ts`: supported extensions, categories, labels, and capability predicates.
- `electron/services/libraryIndexCodec.ts`: relative-path catalog schema, validation, encoding, and decoding.
- `electron/services/activeLibrarySession.ts`: canonical root, generation, index, metadata, scan, and watcher lifecycle.
- `src/lib/librarySessionState.ts`: pure renderer transition and stale-result guards.
- `src/lib/libraryViewPreferences.ts`: versioned per-library filter preference serialization.
- `src/lib/objPreview.ts`: geometry-only OBJ parsing and neutral material application shared by preview and thumbnail code.
- `src/components/FileTypeFilter.tsx`: category/extension checkbox popover and mixed states.
- Focused unit tests matching each new module under `tests/unit/`.

### Existing files changed

- `src/shared/types.ts`: file extension/category and versioned library-session contracts.
- `electron/services/libraryScanner.ts`: discover all supported formats through shared capabilities.
- `electron/services/libraryIndexStore.ts`: asynchronous atomic file repository replacing the single Electron Store snapshot.
- `electron/services/libraryWatcher.ts`: session-aware events and internal-directory exclusion regression coverage.
- `electron/main.ts`: active-session IPC, folder reveal, safe image opening, and benchmark injection.
- `electron/preload.cjs` and `src/shared/preload.d.ts`: typed session, open-file, and reveal-folder bridges.
- `src/App.tsx`: atomic library reset, generation checks, per-library view state, file-specific double-click behavior, and new folder actions.
- `src/lib/folderFilters.ts`: visible-extension sets and recursive folder exclusions.
- `src/lib/modelThumbnailService.ts`: direct image pipeline and session invalidation.
- `src/lib/thumbnailRenderer.ts`: OBJ rendering.
- `src/components/ModelViewer.tsx`: OBJ preview and non-3D image/archive states.
- `src/components/ModelCardThumbnail.tsx`: category-specific stable placeholders.
- `src/components/FolderCardThumbnail.tsx`: image/model mosaics without archive requests.
- `src/components/ModelGrid.tsx`: file-type filter control and active exclusion chips.
- `src/components/DetailsPanel.tsx`: image actions and capability-based sections.
- `src/components/FolderTree.tsx`: excluded-folder state and reveal command plumbing.
- `src/styles.css`: filter popover, chips, image placeholder, OBJ label, and responsive states.

---

### Task 1: Supported File Capabilities and Scanner Coverage

**Files:**
- Create: `src/shared/fileCapabilities.ts`
- Modify: `src/shared/types.ts`
- Modify: `electron/services/libraryScanner.ts`
- Modify: `electron/services/fileDrag.ts`
- Modify: `src/lib/dragFiles.ts`
- Test: `tests/unit/fileCapabilities.test.ts`
- Test: `tests/unit/libraryScanner.test.ts`
- Test: `tests/unit/fileDrag.test.ts`
- Test: `tests/unit/dragFiles.test.ts`

**Interfaces:**
- Produces: `SupportedFileExtension`, `LibraryFileCategory`, `SUPPORTED_FILE_EXTENSIONS`, `getFileCategory(extension)`, `is3dPreviewable(extension)`, `isDirectImage(extension)`, `isArchive(extension)`, and `canSendToSlicer(extension)`.
- Consumers: scanner, filters, cards, details, thumbnails, previews, drag validation, and slicer actions in later tasks.

- [ ] **Step 1: Write failing capability and scanner tests**

```ts
expect(getFileCategory(".obj")).toBe("model");
expect(getFileCategory(".jpeg")).toBe("image");
expect(is3dPreviewable(".obj")).toBe(true);
expect(isDirectImage(".webp")).toBe(true);
expect(isArchive(".rar")).toBe(true);
expect(canSendToSlicer(".png")).toBe(false);

await writeFile(path.join(tempRoot, "shape.OBJ"), "o shape");
await writeFile(path.join(tempRoot, "photo.JPEG"), "image");
const result = await scanLibrary(tempRoot);
expect(result.models.map((file) => file.extension)).toContain(".obj");
expect(result.models.map((file) => file.extension)).toContain(".jpeg");
```

- [ ] **Step 2: Run focused tests and verify the new formats fail**

Run: `npm test -- --run tests/unit/fileCapabilities.test.ts tests/unit/libraryScanner.test.ts tests/unit/fileDrag.test.ts tests/unit/dragFiles.test.ts`

Expected: FAIL because the shared capability module and expanded extension union do not exist.

- [ ] **Step 3: Implement the shared capability table and use it at filesystem boundaries**

```ts
export const SUPPORTED_FILE_EXTENSIONS = [
  ".stl", ".3mf", ".obj",
  ".png", ".jpg", ".jpeg", ".webp",
  ".zip", ".rar", ".7z"
] as const;

export type SupportedFileExtension = typeof SUPPORTED_FILE_EXTENSIONS[number];
export type LibraryFileCategory = "model" | "image" | "archive";

const categories: Record<SupportedFileExtension, LibraryFileCategory> = {
  ".stl": "model", ".3mf": "model", ".obj": "model",
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image",
  ".zip": "archive", ".rar": "archive", ".7z": "archive"
};
```

Change `ModelFile.extension` to `SupportedFileExtension` and derive category on demand through `getFileCategory(model.extension)`. Do not duplicate category in persisted or in-memory file records. Replace duplicate extension arrays in scan and drag validation. Keep slicer launch candidates restricted through `canSendToSlicer` rather than category alone.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run tests/unit/fileCapabilities.test.ts tests/unit/libraryScanner.test.ts tests/unit/fileDrag.test.ts tests/unit/dragFiles.test.ts`

Expected: PASS, including uppercase discovery and rejection of unknown extensions.

- [ ] **Step 5: Commit the capability boundary**

```bash
git add src/shared/fileCapabilities.ts src/shared/types.ts electron/services/libraryScanner.ts electron/services/fileDrag.ts src/lib/dragFiles.ts tests/unit/fileCapabilities.test.ts tests/unit/libraryScanner.test.ts tests/unit/fileDrag.test.ts tests/unit/dragFiles.test.ts
git commit -m "feat: centralize supported library file capabilities"
```

### Task 2: Portable Rebuildable Catalog

**Files:**
- Create: `electron/services/libraryIndexCodec.ts`
- Modify: `electron/services/libraryIndexStore.ts`
- Modify: `electron/services/portableMetadataCodec.ts`
- Modify: `electron/main.ts`
- Test: `tests/unit/libraryIndexCodec.test.ts`
- Test: `tests/unit/libraryIndexStore.test.ts`
- Test: `tests/unit/portableMetadataSecurity.test.ts`
- Test: `tests/unit/thumbnailBenchmarkContract.test.ts`

**Interfaces:**
- Consumes: `SupportedFileExtension` and `LibraryScanResult` from Task 1.
- Produces: `encodeLibraryIndex(rootPath, result, libraryId)`, `decodeLibraryIndex(rootPath, value)`, and async `LibraryIndexStore.load(rootPath)` / `LibraryIndexStore.save(rootPath, libraryId, result)`.

- [ ] **Step 1: Write failing codec and repository tests**

```ts
const manifest = encodeLibraryIndex("C:\\Models", scanResult("C:\\Models"), "library-1");
expect(manifest.files[0].relativePath).toBe("part.stl");
expect(JSON.stringify(manifest)).not.toContain("C:\\\\Models");
expect(() => decodeLibraryIndex("C:\\Models", {
  ...manifest,
  files: [{ ...manifest.files[0], relativePath: "../outside.stl" }]
})).toThrow(/escape|relative/i);
```

Test that an oversized file returns `null`, an interrupted temporary write leaves the previous primary readable, and `.3d-model-library` remains ignored by scanner/watcher tests.

- [ ] **Step 2: Run the catalog tests and verify failure**

Run: `npm test -- --run tests/unit/libraryIndexCodec.test.ts tests/unit/libraryIndexStore.test.ts tests/unit/portableMetadataSecurity.test.ts tests/unit/thumbnailBenchmarkContract.test.ts`

Expected: FAIL because the portable catalog codec and asynchronous repository are absent.

- [ ] **Step 3: Implement relative catalog encoding and strict decoding**

```ts
export type PortableLibraryIndexV1 = {
  schemaVersion: 1;
  libraryId: string;
  savedAt: string;
  folders: string[];
  files: Array<{
    relativePath: string;
    extension: SupportedFileExtension;
    sizeBytes: number;
    modifiedAt: string;
  }>;
};
```

Reconstruct `id`, `absolutePath`, `name`, `relativeFolder`, and null metadata fields only after validating each normalized relative path against the canonical root. Derive category from the validated extension when needed. Cap the index at 32 MiB and 250,000 files. Export the internal directory constant from one shared Electron module so metadata and index code cannot diverge.

- [ ] **Step 4: Implement atomic asynchronous index storage**

Write to `.3d-model-library/LIBRARY_INDEX_DO_NOT_DELETE.json.<uuid>.tmp`, flush and close, then rename over the primary. Apply the Hidden attribute through the same helper used by portable metadata. Return `null` for absent/corrupt/incompatible rebuildable indexes, but propagate root access failures.

Keep the benchmark read-only by injecting an in-memory `LibraryIndexStore` seeded from its scan result; do not create or update `.3d-model-library` during benchmark startup.

- [ ] **Step 5: Run catalog tests and the existing benchmark contract**

Run: `npm test -- --run tests/unit/libraryIndexCodec.test.ts tests/unit/libraryIndexStore.test.ts tests/unit/portableMetadataSecurity.test.ts tests/unit/thumbnailBenchmarkContract.test.ts`

Expected: PASS with no absolute path serialized and no benchmark library writes.

- [ ] **Step 6: Commit the portable catalog**

```bash
git add electron/services/libraryIndexCodec.ts electron/services/libraryIndexStore.ts electron/services/portableMetadataCodec.ts electron/main.ts tests/unit/libraryIndexCodec.test.ts tests/unit/libraryIndexStore.test.ts tests/unit/portableMetadataSecurity.test.ts tests/unit/thumbnailBenchmarkContract.test.ts
git commit -m "feat: store rebuildable index with each library"
```

### Task 3: Active Library Session and Generation Boundary

**Files:**
- Create: `electron/services/activeLibrarySession.ts`
- Create: `src/lib/librarySessionState.ts`
- Modify: `src/shared/types.ts`
- Modify: `electron/services/activeLibraryMetadataStore.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/preload.d.ts`
- Test: `tests/unit/activeLibrarySession.test.ts`
- Test: `tests/unit/activeLibraryMetadataStore.test.ts`
- Test: `tests/unit/librarySessionState.test.ts`
- Test: `tests/unit/preloadContract.test.ts`
- Test: `tests/unit/interactionFlowContract.test.ts`

**Interfaces:**
- Consumes: async `LibraryIndexStore` from Task 2 and active metadata/watcher services.
- Produces: `LibrarySessionRef { generation, rootPath, libraryId }`, `LibraryActivationResult { session, cachedResult, metadata, metadataStatus }`, `VersionedLibraryScanResult { session, result }`, and `isCurrentLibraryResult(active, incoming)`.

- [ ] **Step 1: Write failing stale-generation and switch-order tests**

```ts
const first = await session.activate("C:\\First", true);
const pendingFirstScan = session.scan(first.session);
const second = await session.activate("C:\\Second", true);
await expect(pendingFirstScan).rejects.toThrow(/stale/i);
expect(session.current()?.rootPath).toBe("C:\\Second");
expect(second.cachedResult?.rootPath).toBe("C:\\Second");
```

Assert that activating the second root closes the first watcher before opening the second watcher, metadata is rebound before activation resolves, and a failed canonicalization leaves no cached data from the first root in the returned activation.

- [ ] **Step 2: Run session tests and verify failure**

Run: `npm test -- --run tests/unit/activeLibrarySession.test.ts tests/unit/activeLibraryMetadataStore.test.ts tests/unit/librarySessionState.test.ts tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts`

Expected: FAIL because IPC responses have no session identity and root switching is split across settings, metadata, scanner, and watcher code.

- [ ] **Step 3: Implement the main-process active session**

```ts
export type ActiveLibrarySession = {
  activate(rootPath: string | null, monitoring: boolean): Promise<LibraryActivationResult>;
  scan(expected: LibrarySessionRef): Promise<VersionedLibraryScanResult>;
  setMonitoring(expected: LibrarySessionRef, enabled: boolean): Promise<void>;
  current(): LibrarySessionRef | null;
  close(): Promise<void>;
};
```

Canonicalize the requested root first. After it succeeds, increment generation, dispose old runtime work, bind metadata, read its library ID through a new `getLibraryId(): string | null` method, load only that root's catalog, and start the watcher. A scan may save only after `assertCurrent(expected)` succeeds both before and after filesystem traversal.

- [ ] **Step 4: Replace root-based IPC with session-based IPC**

Expose `activateLibrary(rootPath, monitoring)`, `scanLibrary(session)`, and `setLibraryMonitoring(session, enabled)`. Include `LibrarySessionRef` in `library:changed` and monitoring-error events. Keep settings persistence separate: saving a new `libraryPath` records preference, while activation owns runtime switching.

- [ ] **Step 5: Add pure renderer transition guards**

```ts
export function isCurrentLibraryResult(
  active: LibrarySessionRef | null,
  incoming: LibrarySessionRef
): boolean {
  return Boolean(active) &&
    active!.generation === incoming.generation &&
    normalizeRoot(active!.rootPath) === normalizeRoot(incoming.rootPath);
}
```

Add a reset helper returning all transient library-scoped UI defaults: empty result, no selection, all-folders navigation, empty history, no drag, no preview, no search, and closed context menus.

- [ ] **Step 6: Run session and bridge tests**

Run: `npm test -- --run tests/unit/activeLibrarySession.test.ts tests/unit/activeLibraryMetadataStore.test.ts tests/unit/librarySessionState.test.ts tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts`

Expected: PASS, including two rapid switches and stale watcher events.

- [ ] **Step 7: Commit atomic session ownership**

```bash
git add electron/services/activeLibrarySession.ts src/lib/librarySessionState.ts src/shared/types.ts electron/services/activeLibraryMetadataStore.ts electron/main.ts electron/preload.cjs src/shared/preload.d.ts tests/unit/activeLibrarySession.test.ts tests/unit/activeLibraryMetadataStore.test.ts tests/unit/librarySessionState.test.ts tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts
git commit -m "feat: isolate active library sessions"
```

### Task 4: React Library Switching and Per-Library Preferences

**Files:**
- Create: `src/lib/libraryViewPreferences.ts`
- Modify: `src/App.tsx`
- Modify: `src/lib/modelThumbnailService.ts`
- Modify: `src/lib/viewPreferences.ts`
- Test: `tests/unit/libraryViewPreferences.test.ts`
- Test: `tests/unit/modelThumbnailService.test.ts`
- Test: `tests/unit/productFlowContract.test.ts`

**Interfaces:**
- Consumes: session contracts and `isCurrentLibraryResult` from Task 3.
- Produces: `LibraryViewPreferencesV1`, `loadLibraryViewPreferences(storage, libraryId)`, `saveLibraryViewPreferences(storage, libraryId, value)`, and `modelThumbnailService.beginLibrarySession(sessionKey)`.

- [ ] **Step 1: Write failing preference isolation and thumbnail invalidation tests**

```ts
saveLibraryViewPreferences(storage, "library-a", {
  visibleExtensions: [".stl"],
  excludedFolders: ["archive/old"]
});
expect(loadLibraryViewPreferences(storage, "library-b").excludedFolders).toEqual([]);

service.beginLibrarySession("2:C:/Second");
expect(await oldRequest.promise).toBeNull();
```

Assert invalid JSON and unknown extensions fall back to defaults, and an old thumbnail completion after `beginLibrarySession` is not retained or delivered as a current result.

- [ ] **Step 2: Run focused renderer tests and verify failure**

Run: `npm test -- --run tests/unit/libraryViewPreferences.test.ts tests/unit/modelThumbnailService.test.ts tests/unit/productFlowContract.test.ts`

Expected: FAIL because preferences are global component state and thumbnail work has no library generation.

- [ ] **Step 3: Implement versioned per-library preference storage**

```ts
export type LibraryViewPreferencesV1 = {
  version: 1;
  visibleExtensions: SupportedFileExtension[];
  excludedFolders: string[];
};
```

Use a storage key based on sanitized `libraryId`, normalize folder separators, deduplicate values, reject absolute/traversing folders, and remove unsupported extensions while decoding.

- [ ] **Step 4: Make React activation atomic**

In `App.tsx`, centralize switching in `activateLibrary(rootPath)`: clear transient state first, call the bridge, store the returned session ref, begin the thumbnail session, restore only that library's view preferences, publish cached results if current, then request reconciliation. Gate scan, metadata, watch, preview, and monitoring updates with `isCurrentLibraryResult`.

Do not preserve selection or search across roots. Keep theme, drag behavior, and slicer paths as machine-wide settings.

- [ ] **Step 5: Add thumbnail session invalidation**

Tag each pipeline entry with the active session key. `beginLibrarySession` changes the key, resolves queued old entries to `null`, clears old session failures, and prevents active old work from writing cache or reporting a usable result after completion.

- [ ] **Step 6: Run renderer switching tests**

Run: `npm test -- --run tests/unit/libraryViewPreferences.test.ts tests/unit/modelThumbnailService.test.ts tests/unit/productFlowContract.test.ts`

Expected: PASS with library-specific preferences and no old thumbnail publication.

- [ ] **Step 7: Commit renderer session switching**

```bash
git add src/lib/libraryViewPreferences.ts src/App.tsx src/lib/modelThumbnailService.ts src/lib/viewPreferences.ts tests/unit/libraryViewPreferences.test.ts tests/unit/modelThumbnailService.test.ts tests/unit/productFlowContract.test.ts
git commit -m "feat: reset and restore each library view atomically"
```

### Task 5: Composable Type and Excluded-Folder Filters

**Files:**
- Create: `src/components/FileTypeFilter.tsx`
- Modify: `src/lib/folderFilters.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/ModelGrid.tsx`
- Modify: `src/components/FolderTree.tsx`
- Modify: `src/styles.css`
- Test: `tests/unit/folderFilters.test.ts`
- Test: `tests/unit/FileTypeFilter.test.tsx`
- Test: `tests/unit/contextMenuContract.test.ts`
- Test: `tests/unit/layoutContract.test.ts`

**Interfaces:**
- Consumes: supported capability groups and per-library preferences.
- Produces: `visibleExtensions: ReadonlySet<SupportedFileExtension>`, `excludedFolders: readonly string[]`, `isFolderExcluded(modelFolder, exclusions)`, and `FileTypeFilter` callbacks.

- [ ] **Step 1: Write failing pure filter and mixed-checkbox tests**

```ts
const result = filterModels(files, ALL_FOLDERS_ID, true, "", {
  visibleExtensions: new Set([".stl", ".obj"]),
  excludedFolders: ["parts"]
});
expect(result.map((file) => file.name)).toEqual(["root.stl", "ship.obj"]);
expect(isFolderExcluded("parts/sub", ["parts"])).toBe(true);
expect(isFolderExcluded("parts-old", ["parts"])).toBe(false);
```

Render the category control with only `.stl` selected and assert Models is indeterminate, Images and Archives are unchecked, and toggling Images emits all four image extensions.

- [ ] **Step 2: Run filter tests and verify failure**

Run: `npm test -- --run tests/unit/folderFilters.test.ts tests/unit/FileTypeFilter.test.tsx tests/unit/contextMenuContract.test.ts tests/unit/layoutContract.test.ts`

Expected: FAIL because filtering accepts one `ModelTypeFilter` and no folder exclusions.

- [ ] **Step 3: Replace the single type with extension-set filtering**

Remove `ModelTypeFilter`. Add `visibleExtensions` and `excludedFolders` to `ModelFilterOptions`. Normalize folder paths into segments and compare complete segment ancestry. Apply type/exclusion checks before metadata and search checks, then retain existing AND behavior for the remaining filters.

- [ ] **Step 4: Build the accessible type filter popover**

Use category rows with native checkboxes, child extension checkboxes, `aria-expanded`, `aria-checked="mixed"`, and clear labels. Permit zero visible extensions and show `Todos os tipos estão ocultos` in the grid empty state.

- [ ] **Step 5: Add recursive exclusions and visible chips**

Add `Ocultar dos resultados` to folder context menus except for `ALL_FOLDERS_ID`. Keep excluded folders in the tree with a muted indicator. Render relative-path chips in the filter summary and remove one exclusion per chip. Make `Limpar filtros` restore all supported extensions and clear exclusions along with existing filters.

- [ ] **Step 6: Persist changes under the active library ID**

Save visible extensions and exclusions through Task 4's preference codec whenever they change. During reconciliation, remove exclusions whose exact folder no longer exists.

- [ ] **Step 7: Run filter and layout tests**

Run: `npm test -- --run tests/unit/folderFilters.test.ts tests/unit/FileTypeFilter.test.tsx tests/unit/contextMenuContract.test.ts tests/unit/layoutContract.test.ts`

Expected: PASS, with controls fitting both themes and context menus remaining inside the viewport.

- [ ] **Step 8: Commit composable filters**

```bash
git add src/components/FileTypeFilter.tsx src/lib/folderFilters.ts src/App.tsx src/components/ModelGrid.tsx src/components/FolderTree.tsx src/styles.css tests/unit/folderFilters.test.ts tests/unit/FileTypeFilter.test.tsx tests/unit/contextMenuContract.test.ts tests/unit/layoutContract.test.ts
git commit -m "feat: add file type and excluded folder filters"
```

### Task 6: Lazy Image Thumbnails and Windows Opening

**Files:**
- Modify: `src/lib/modelThumbnailService.ts`
- Modify: `src/components/ModelCardThumbnail.tsx`
- Modify: `src/components/FolderCardThumbnail.tsx`
- Modify: `src/components/DetailsPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/preload.d.ts`
- Modify: `src/styles.css`
- Test: `tests/unit/modelThumbnailService.test.ts`
- Test: `tests/unit/ModelCardThumbnail.test.tsx`
- Test: `tests/unit/FolderCardThumbnail.test.tsx`
- Test: `tests/unit/preloadContract.test.ts`
- Test: `tests/unit/interactionFlowContract.test.ts`

**Interfaces:**
- Consumes: `isDirectImage` and active-session path validation.
- Produces: `openLibraryFile(absolutePath): Promise<void>` and thumbnail dependency `readImageDataUrl(model): Promise<string>`.

- [ ] **Step 1: Write failing image-pipeline and open-file tests**

```ts
const request = service.request(imageModel("photo.webp"), "visible");
expect(await request.promise).toBe("data:image/webp;base64,AAAA");
expect(renderThumbnail).not.toHaveBeenCalled();

await window.modelLibrary.openLibraryFile("C:\\Models\\photo.jpg");
expect(openPath).toHaveBeenCalledWith("C:\\Models\\photo.jpg");
```

Assert a corrupt image returns `null` without blocking the next request, cache writes still occur, archives never enter the image pipeline, and a path outside the active root is rejected.

- [ ] **Step 2: Run focused image tests and verify failure**

Run: `npm test -- --run tests/unit/modelThumbnailService.test.ts tests/unit/ModelCardThumbnail.test.tsx tests/unit/FolderCardThumbnail.test.tsx tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts`

Expected: FAIL because image requests currently reach a 3D-only renderer and there is no safe Windows-open bridge.

- [ ] **Step 3: Add bounded direct-image decoding**

Read the image through a validated main-process API that returns a MIME-correct data URL with a 40 MiB source-size cap. In the thumbnail I/O stage, check persistent cache first, then read direct images, then write the resulting data URL through the existing cache. Never enter the WebGL render queue for image files.

- [ ] **Step 4: Add image-specific cards and mosaics**

Use Lucide `Image` as the stable fallback. Keep `img` non-draggable so native file drag continues from the card. Folder mosaics may request model or image files but must skip archives. Preserve visible-card priority above mosaics.

- [ ] **Step 5: Open images through Windows on double-click**

Add `system:open-library-file`. Canonicalize the live file, assert it is a supported direct image inside the active root, and call `shell.openPath`. Treat a non-empty Electron return string as failure. In `App.tsx`, route image double-click to this action; model double-click keeps slicer behavior, and archive double-click keeps archive inspection.

- [ ] **Step 6: Run image tests**

Run: `npm test -- --run tests/unit/modelThumbnailService.test.ts tests/unit/ModelCardThumbnail.test.tsx tests/unit/FolderCardThumbnail.test.tsx tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts`

Expected: PASS with no 3D render call for images.

- [ ] **Step 7: Commit image browsing**

```bash
git add src/lib/modelThumbnailService.ts src/components/ModelCardThumbnail.tsx src/components/FolderCardThumbnail.tsx src/components/DetailsPanel.tsx src/App.tsx electron/main.ts electron/preload.cjs src/shared/preload.d.ts src/styles.css tests/unit/modelThumbnailService.test.ts tests/unit/ModelCardThumbnail.test.tsx tests/unit/FolderCardThumbnail.test.tsx tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts
git commit -m "feat: browse images with lazy thumbnails"
```

### Task 7: Geometry-Only OBJ Preview and Thumbnails

**Files:**
- Create: `src/lib/objPreview.ts`
- Modify: `src/lib/thumbnailRenderer.ts`
- Modify: `src/lib/modelThumbnailService.ts`
- Modify: `src/components/ModelViewer.tsx`
- Modify: `src/components/DetailsPanel.tsx`
- Modify: `src/shared/thumbnailVersion.ts`
- Test: `tests/unit/objPreview.test.ts`
- Test: `tests/unit/modelThumbnailService.test.ts`
- Test: `tests/unit/modelOrientation.test.ts`

**Interfaces:**
- Consumes: `OBJLoader`, existing `orientModelForBed`, and shared thumbnail renderer.
- Produces: `parseObjPreview(modelBytes: ArrayBuffer): THREE.Group`.

- [ ] **Step 1: Write failing OBJ parser and thumbnail tests**

```ts
const bytes = new TextEncoder().encode([
  "o triangle",
  "v 0 0 0",
  "v 20 0 0",
  "v 0 20 0",
  "f 1 2 3"
].join("\n")).buffer;
const object = parseObjPreview(bytes);
expect(new THREE.Box3().setFromObject(object).isEmpty()).toBe(false);
object.traverse((child) => {
  if (child instanceof THREE.Mesh) expect(child.material).toBeInstanceOf(THREE.MeshStandardMaterial);
});
```

Assert empty/malformed geometry throws a concise error, groups remain separate children, and `.obj` routes to generated render rather than embedded 3MF lookup.

- [ ] **Step 2: Run OBJ tests and verify failure**

Run: `npm test -- --run tests/unit/objPreview.test.ts tests/unit/modelThumbnailService.test.ts tests/unit/modelOrientation.test.ts`

Expected: FAIL because no OBJ parser exists.

- [ ] **Step 3: Implement geometry-only OBJ parsing**

Decode UTF-8 bytes with `TextDecoder`, parse through `OBJLoader.parse`, reject an object with no non-empty mesh geometry, compute vertex normals when absent, replace every imported material with the neutral `MeshStandardMaterial`, and mark meshes for shadows. Do not fetch or resolve MTL or texture paths.

- [ ] **Step 4: Integrate OBJ into preview and thumbnail rendering**

Route `.obj` through `parseObjPreview` and `orientModelForBed` in both `ModelViewer` and `thumbnailRenderer`. Increment `THUMBNAIL_RENDER_VERSION` from `2` to `3` so old fallback results cannot collide with OBJ-capable renders. Keep existing camera controls and bounds fitting.

- [ ] **Step 5: Run OBJ and thumbnail tests**

Run: `npm test -- --run tests/unit/objPreview.test.ts tests/unit/modelThumbnailService.test.ts tests/unit/modelOrientation.test.ts tests/unit/thumbnailCache.test.ts`

Expected: PASS, including malformed OBJ failure isolation and versioned cache identity.

- [ ] **Step 6: Commit OBJ visualization**

```bash
git add src/lib/objPreview.ts src/lib/thumbnailRenderer.ts src/lib/modelThumbnailService.ts src/components/ModelViewer.tsx src/components/DetailsPanel.tsx src/shared/thumbnailVersion.ts tests/unit/objPreview.test.ts tests/unit/modelThumbnailService.test.ts tests/unit/modelOrientation.test.ts tests/unit/thumbnailCache.test.ts
git commit -m "feat: preview obj geometry"
```

### Task 8: Folder Reveal and Capability-Based Actions

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/preload.d.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/FolderTree.tsx`
- Modify: `src/components/DetailsPanel.tsx`
- Test: `tests/unit/preloadContract.test.ts`
- Test: `tests/unit/contextMenuContract.test.ts`
- Test: `tests/unit/productFlowContract.test.ts`

**Interfaces:**
- Consumes: active session and capability predicates.
- Produces: `showLibraryFolder(relativeFolder: string): Promise<void>`.

- [ ] **Step 1: Write failing folder-reveal and action-routing tests**

```ts
await showLibraryFolder(activeSession, "cosplay/helmet");
expect(openPath).toHaveBeenCalledWith("C:\\Models\\cosplay\\helmet");
await expect(showLibraryFolder(activeSession, "../outside")).rejects.toThrow(/library/i);
```

Assert the root is represented by an empty relative folder, files use `showItemInFolder`, images show `Abrir no Windows`, archives show extraction actions, and only slicer-capable model formats show slicer commands.

- [ ] **Step 2: Run reveal/action tests and verify failure**

Run: `npm test -- --run tests/unit/preloadContract.test.ts tests/unit/contextMenuContract.test.ts tests/unit/productFlowContract.test.ts`

Expected: FAIL because folders do not expose a safe reveal bridge and UI sections still rely on local extension arrays.

- [ ] **Step 3: Implement safe folder reveal**

Resolve the relative folder against the active canonical root, reject absolute paths, traversal, symlinks escaping the root, missing targets, and non-directories, then call `shell.openPath`. Expose `showLibraryFolder` in preload and TypeScript declarations.

- [ ] **Step 4: Add root and nested context-menu commands**

Place `Mostrar no Explorer` in every folder context menu, including `ALL_FOLDERS_ID`, and close the menu before starting the external action. Use concise failure feedback in the existing operation toast.

- [ ] **Step 5: Replace remaining extension conditionals with capabilities**

Use shared predicates in double-click, details actions, context menus, conversion visibility, archive inspection, slicer launch selection, and folder mosaic candidate selection. Ensure selected images/archives cannot be included in a slicer batch merely because an STL is also selected.

- [ ] **Step 6: Run reveal/action tests**

Run: `npm test -- --run tests/unit/preloadContract.test.ts tests/unit/contextMenuContract.test.ts tests/unit/productFlowContract.test.ts`

Expected: PASS with safe root/nested reveal and category-correct actions.

- [ ] **Step 7: Commit Explorer integration**

```bash
git add electron/main.ts electron/preload.cjs src/shared/preload.d.ts src/App.tsx src/components/FolderTree.tsx src/components/DetailsPanel.tsx tests/unit/preloadContract.test.ts tests/unit/contextMenuContract.test.ts tests/unit/productFlowContract.test.ts
git commit -m "feat: reveal library folders in explorer"
```

### Task 9: Full Regression, Two-Library Exercise, and Real-Library Read-Only Check

**Files:**
- Modify: `tests/unit/interactionFlowContract.test.ts`
- Modify: `tests/unit/performanceContract.test.ts`
- Modify: `tests/unit/layoutContract.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: release evidence and user-facing documentation for the new formats, filters, and index location.

- [ ] **Step 1: Add final cross-feature regression contracts**

Assert library activation resets selection/search/navigation before cached publication, every incoming event carries a session, filter changes do not call `scanLibrary`, image cards do not enter WebGL rendering, OBJ does enter bounded rendering, and native/internal drag contracts still include every supported externally draggable format.

- [ ] **Step 2: Run the complete unit suite**

Run: `npm test`

Expected: all tests pass with no unhandled promise rejection.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite complete successfully with no missing preload assets.

- [ ] **Step 4: Exercise rapid switching with temporary libraries**

Create two temporary test roots outside the real library. Give each a unique STL/OBJ/image name, portable metadata manifest, catalog snapshot, and excluded-folder preference. Switch A -> B -> A while scans and thumbnails are active. Confirm that each view contains only its own files, metadata, filters, and thumbnails; then remove only those temporary roots.

- [ ] **Step 5: Verify Windows and file-management flows manually**

Confirm image double-click opens the Windows default viewer, root and nested folders open in Explorer, OBJ preview pans/zooms/rotates, internal drag moves and undoes, native external drag copies, archives inspect/extract, and slicer actions ignore images/archives.

- [ ] **Step 6: Run a read-only real-library validation**

Open the configured real library and browse/filter it without invoking rename, move, trash, conversion, extraction, or index rewrite from the test harness. Confirm cached grid restoration, progressive thumbnails, folder exclusions, an image sample, and an OBJ sample when present. Record aggregate counts only; do not commit paths, filenames, notes, tags, thumbnails, or model content.

- [ ] **Step 7: Update documentation**

Document supported formats, image double-click behavior, geometry-only OBJ limitation, per-library hidden data files, rebuildable versus durable data, filter semantics, and how to recover by deleting only `LIBRARY_INDEX_DO_NOT_DELETE.json` when the catalog is damaged.

- [ ] **Step 8: Re-run suite, build, and diff checks**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: production build succeeds.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 9: Commit final regression coverage and documentation**

```bash
git add tests/unit/interactionFlowContract.test.ts tests/unit/performanceContract.test.ts tests/unit/layoutContract.test.ts README.md
git commit -m "test: verify expanded library workflow"
```

## Final Review Checklist

- [ ] Every requirement in the linked specification maps to a task above.
- [ ] `git status --short` contains no unexpected tracked or personal files.
- [ ] No report or fixture contains an absolute personal path, model filename, note, tag, or thumbnail.
- [ ] The `.superpowers/` process directory remains untracked and untouched.
- [ ] A reviewer checks both behavior and specification compliance before branch integration.
- [ ] The branch is not merged or pushed until the user explicitly chooses the integration action.
