# Library Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make large model libraries appear immediately, remain synchronized with disk, and load thumbnails smoothly while adding useful recent-use and notes filters.

**Architecture:** Electron owns the authoritative filesystem index, watcher, and disk thumbnail cache. React restores a cached snapshot before background reconciliation, virtualizes the visible rows, and schedules GPU thumbnail work by viewport priority. Existing file operations and native drag APIs remain unchanged.

**Tech Stack:** Electron 33, React 18, TypeScript, Vitest, Three.js, electron-store, Chokidar 4, TanStack React Virtual 3.

**Spec:** `docs/superpowers/specs/2026-09-09-library-performance-design.md`

## Global Constraints

- Packaging and installer work are out of scope.
- The filesystem is authoritative; cached data never authorizes file operations.
- Do not change internal drag, native Windows drag, slicer launch, conversion, archive, tags, notes, or folder-operation semantics.
- Geometry parsing and thumbnail generation must not run during filesystem scanning.
- Monitoring is remembered, enabled by default for a local library, and manual Refresh always remains available.
- Existing thumbnail jobs that started must finish and persist; current visible cards may overtake older queued work.
- Custom thumbnail selection is deferred.

---

### Task 1: Faster Scanner and Measurement Contract

**Files:**
- Modify: `electron/services/libraryScanner.ts`
- Create: `electron/services/boundedTaskPool.ts`
- Test: `tests/unit/boundedTaskPool.test.ts`
- Modify: `tests/unit/libraryScanner.test.ts`
- Modify: `tests/unit/performanceContract.test.ts`

**Interfaces:**
- Produces: `runBounded<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]>`
- Preserves: `scanLibrary(rootPath: string): Promise<LibraryScanResult>`

- [x] **Step 1: Write failing pool and scanner tests**

```ts
it("never exceeds the configured concurrency", async () => {
  let active = 0;
  let maximum = 0;
  const values = await runBounded([1, 2, 3, 4], 2, async (value) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    active -= 1;
    return value * 2;
  });
  expect(values).toEqual([2, 4, 6, 8]);
  expect(maximum).toBeLessThanOrEqual(2);
});
```

- [x] **Step 2: Run the focused tests and confirm the missing export failure**

Run: `npm test -- tests/unit/boundedTaskPool.test.ts tests/unit/libraryScanner.test.ts`

Expected: FAIL because `runBounded` does not exist.

- [x] **Step 3: Implement the bounded task pool and collect stat work before awaiting it**

```ts
export async function runBounded<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return results;
}
```

Use a concurrency of `8` for file stats. Preserve deterministic model and folder sorting after all work finishes.

- [x] **Step 4: Run focused tests and the performance contract**

Run: `npm test -- tests/unit/boundedTaskPool.test.ts tests/unit/libraryScanner.test.ts tests/unit/performanceContract.test.ts`

Expected: PASS.

- [x] **Step 5: Commit the scanner change**

```bash
git add electron/services/boundedTaskPool.ts electron/services/libraryScanner.ts tests/unit/boundedTaskPool.test.ts tests/unit/libraryScanner.test.ts tests/unit/performanceContract.test.ts
git commit -m "perf: bound library scan metadata work"
```

### Task 2: Persistent Library Index and Two-Phase Startup

**Files:**
- Create: `electron/services/libraryIndexStore.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/preload.d.ts`
- Modify: `src/App.tsx`
- Test: `tests/unit/libraryIndexStore.test.ts`
- Modify: `tests/unit/preloadContract.test.ts`
- Modify: `tests/unit/interactionFlowContract.test.ts`

**Interfaces:**
- Produces: `LibraryIndexSnapshot = { version: 1; savedAt: string; result: LibraryScanResult }`
- Produces: `LibraryIndexStore.get(rootPath: string): LibraryScanResult | null`
- Produces: `LibraryIndexStore.set(result: LibraryScanResult): void`
- Produces preload API: `getCachedLibrary(rootPath: string): Promise<LibraryScanResult | null>`
- Preserves preload API: `scanLibrary(rootPath: string): Promise<LibraryScanResult>`

- [x] **Step 1: Write failing index validation tests**

```ts
it("returns only a versioned snapshot for the requested library", () => {
  const backend = memoryBackend();
  const store = createLibraryIndexStore(backend);
  store.set(scanResult("C:\\Models"));
  expect(store.get("C:\\Models")?.rootPath).toBe("C:\\Models");
  expect(store.get("C:\\Other")).toBeNull();
});

it("ignores corrupt snapshots", () => {
  const store = createLibraryIndexStore({ get: () => ({ version: 99 }), set: vi.fn() });
  expect(store.get("C:\\Models")).toBeNull();
});
```

- [x] **Step 2: Run the index test and confirm it fails**

Run: `npm test -- tests/unit/libraryIndexStore.test.ts`

Expected: FAIL because the store module does not exist.

- [x] **Step 3: Implement the versioned store and Electron backend**

```ts
export type LibraryIndexSnapshot = {
  version: 1;
  savedAt: string;
  result: LibraryScanResult;
};

export type LibraryIndexStore = {
  get(rootPath: string): LibraryScanResult | null;
  set(result: LibraryScanResult): void;
};
```

Use a dedicated `electron-store` file named `library-index`. Clone validated results on read/write.

- [x] **Step 4: Add cached-index IPC and persist successful scans**

```ts
ipcMain.handle("library:get-cached", (_event, rootPath: string) => {
  assertConfiguredLibraryRoot(rootPath);
  return libraryIndexStore.get(rootPath);
});

ipcMain.handle("library:scan", async (_event, rootPath: string) => {
  assertConfiguredLibraryRoot(rootPath);
  const result = await scanLibrary(rootPath);
  libraryIndexStore.set(result);
  return result;
});
```

- [x] **Step 5: Restore cached content before background reconciliation in App**

```ts
const cached = await window.modelLibrary.getCachedLibrary(settings.libraryPath);
if (cached) setScanResult(cached);
void scanLibrary(settings.libraryPath);
```

Do not set the grid to an empty loading state when cached content exists. Keep `isScanning` true until reconciliation finishes.

- [x] **Step 6: Run index, preload, interaction, and full tests**

Run: `npm test -- tests/unit/libraryIndexStore.test.ts tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts`

Expected: PASS.

- [x] **Step 7: Commit two-phase startup**

```bash
git add electron/services/libraryIndexStore.ts electron/main.ts electron/preload.cjs src/shared/types.ts src/shared/preload.d.ts src/App.tsx tests/unit/libraryIndexStore.test.ts tests/unit/preloadContract.test.ts tests/unit/interactionFlowContract.test.ts
git commit -m "perf: restore cached library before reconciliation"
```

### Task 3: Optional Incremental Folder Monitoring

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `electron/services/libraryWatcher.ts`
- Modify: `electron/services/libraryScanner.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/preload.d.ts`
- Modify: `electron/services/settingsStore.ts`
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/App.tsx`
- Test: `tests/unit/libraryWatcher.test.ts`
- Modify: `tests/unit/settingsStore.test.ts`

**Interfaces:**
- Adds setting: `monitorLibrary: boolean`
- Produces: `LibraryWatchEvent = { type: "add" | "change" | "unlink" | "addDir" | "unlinkDir"; absolutePath: string }`
- Produces: `createLibraryWatcher(options): { close(): Promise<void> }`
- Produces preload API: `setLibraryMonitoring(enabled: boolean): Promise<void>`
- Produces preload subscription: `onLibraryChanged(callback: (events: LibraryWatchEvent[]) => void): () => void`

- [x] **Step 1: Install the watcher dependency**

Run: `npm install chokidar@^4.0.3`

Expected: package and lockfile include Chokidar 4.

- [x] **Step 2: Write failing debounce, extension, and close tests**

```ts
it("coalesces supported changes and ignores unrelated files", async () => {
  const batches: LibraryWatchEvent[][] = [];
  const watcher = createLibraryWatcher({ rootPath, debounceMs: 50, onBatch: (batch) => batches.push(batch) });
  fakeWatcher.emit("add", path.join(rootPath, "part.stl"));
  fakeWatcher.emit("add", path.join(rootPath, "notes.txt"));
  await vi.advanceTimersByTimeAsync(51);
  expect(batches).toEqual([[{ type: "add", absolutePath: path.join(rootPath, "part.stl") }]]);
  await watcher.close();
});
```

- [x] **Step 3: Implement Chokidar monitoring with a 500 ms debounce**

Use `ignoreInitial: true`, `atomic: true`, `awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }`, and `usePolling: false`. Watch only the configured library and normalize supported file events before batching.

- [x] **Step 4: Add incremental event reconciliation**

```ts
export async function applyLibraryWatchEvents(
  current: LibraryScanResult,
  events: LibraryWatchEvent[]
): Promise<LibraryScanResult>;
```

For add/change, stat the exact supported file and replace its model signature. For unlink, remove the exact file. For addDir, add its relative folder. For unlinkDir, remove the folder, descendants, and contained models. Sort once after the batch.

- [x] **Step 5: Wire monitoring lifecycle and settings**

Start after initial reconciliation when enabled. Close before changing library or disabling. Publish validated batches to the renderer and persist the reconciled index. Add a Settings toggle labelled `Monitorar alteracoes automaticamente`.

- [x] **Step 6: Run watcher and settings tests**

Run: `npm test -- tests/unit/libraryWatcher.test.ts tests/unit/libraryScanner.test.ts tests/unit/settingsStore.test.ts`

Expected: PASS.

- [x] **Step 7: Commit monitoring**

```bash
git add package.json package-lock.json electron/services/libraryWatcher.ts electron/services/libraryScanner.ts electron/services/settingsStore.ts electron/main.ts electron/preload.cjs src/shared/types.ts src/shared/preload.d.ts src/components/SettingsDialog.tsx src/App.tsx tests/unit/libraryWatcher.test.ts tests/unit/libraryScanner.test.ts tests/unit/settingsStore.test.ts
git commit -m "feat: monitor library changes incrementally"
```

### Task 4: Persistent Thumbnail Cache

**Files:**
- Create: `electron/services/thumbnailCache.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/preload.d.ts`
- Modify: `src/components/ModelCardThumbnail.tsx`
- Test: `tests/unit/thumbnailCache.test.ts`
- Modify: `tests/unit/preloadContract.test.ts`

**Interfaces:**
- Produces: `ThumbnailSignature = Pick<ModelFile, "absolutePath" | "sizeBytes" | "modifiedAt">`
- Produces preload API: `readCachedThumbnail(model: ThumbnailSignature): Promise<string | null>`
- Produces preload API: `writeCachedThumbnail(model: ThumbnailSignature, dataUrl: string): Promise<void>`
- Internal renderer version: `THUMBNAIL_RENDER_VERSION = 1`

- [x] **Step 1: Write failing key, invalidation, corrupt-read, and atomic-write tests**

```ts
it("changes the cache key when model content signature changes", () => {
  expect(createThumbnailCacheKey(model({ sizeBytes: 10 })))
    .not.toBe(createThumbnailCacheKey(model({ sizeBytes: 11 })));
});
```

- [x] **Step 2: Run cache tests and confirm failure**

Run: `npm test -- tests/unit/thumbnailCache.test.ts`

Expected: FAIL because the cache module does not exist.

- [x] **Step 3: Implement app-data cache with generated keys only**

Hash the canonical path, size, modified time, and renderer version with SHA-256. Accept only `data:image/png`, `data:image/jpeg`, and `data:image/webp`; cap writes at 5 MB. Write `<hash>.tmp`, then rename to `<hash>.<ext>`.

- [x] **Step 4: Read cache before embedded or rendered work and persist successful results**

```ts
const cached = await window.modelLibrary.readCachedThumbnail(model);
if (cached) return cached;
const image = await resolveUncachedModelThumbnail(model);
if (image) void window.modelLibrary.writeCachedThumbnail(model, image);
return image;
```

- [x] **Step 5: Add idle pruning**

Prune entries older than 90 days and then oldest entries until the cache is at most 512 MB. Run after app ready and never block window creation.

- [x] **Step 6: Run focused and full thumbnail tests**

Run: `npm test -- tests/unit/thumbnailCache.test.ts tests/unit/modelThumbnail.test.ts tests/unit/preloadContract.test.ts`

Expected: PASS.

- [x] **Step 7: Commit thumbnail persistence**

```bash
git add electron/services/thumbnailCache.ts electron/main.ts electron/preload.cjs src/shared/preload.d.ts src/components/ModelCardThumbnail.tsx tests/unit/thumbnailCache.test.ts tests/unit/preloadContract.test.ts
git commit -m "perf: persist generated model thumbnails"
```

### Task 5: Priority Thumbnail Scheduler and Reused GPU Renderer

**Files:**
- Create: `src/lib/thumbnailScheduler.ts`
- Create: `src/lib/thumbnailRenderer.ts`
- Modify: `src/lib/modelThumbnailQueue.ts`
- Modify: `src/components/ModelCardThumbnail.tsx`
- Modify: `src/components/FolderCardThumbnail.tsx`
- Test: `tests/unit/thumbnailScheduler.test.ts`
- Modify: `tests/unit/performanceContract.test.ts`

**Interfaces:**
- Produces: `ThumbnailPriority = "visible" | "nearby" | "background"`
- Produces: `ThumbnailRequest = { promise: Promise<string | null>; setPriority(priority: ThumbnailPriority): void }`
- Produces: `requestRenderedModelThumbnail(model: ModelFile, priority: ThumbnailPriority): ThumbnailRequest`
- Produces: `renderThumbnail(extension: ModelFile["extension"], bytes: ArrayBuffer): string`

- [x] **Step 1: Write failing scheduler tests**

```ts
it("lets a visible job overtake queued background work", async () => {
  const order: string[] = [];
  const scheduler = createThumbnailScheduler({ concurrency: 1 });
  scheduler.enqueue("active", "visible", job("active", order));
  scheduler.enqueue("old", "background", job("old", order));
  scheduler.enqueue("current", "visible", job("current", order));
  await scheduler.onIdle();
  expect(order).toEqual(["active", "current", "old"]);
});
```

- [x] **Step 2: Implement stable priority queues and deduplication**

Jobs already running are never cancelled. `setPriority` reorders queued work. Repeated cache keys share a promise. Failed keys return null and are not retried during the same session.

- [x] **Step 3: Extract a single reusable WebGL renderer**

Create one renderer lazily with `powerPreference: "high-performance"`. Dispose model geometry/materials after every image, retain the renderer/canvas, and recreate it only after context loss or render failure.

- [x] **Step 4: Drive priority from both thumbnail components**

Use an IntersectionObserver with a nearby root margin. Exact intersection promotes to `visible`; nearby is `nearby`; folder mosaics begin as `background`. Unmounting demotes queued work instead of discarding started work.

- [x] **Step 5: Run scheduler and performance tests**

Run: `npm test -- tests/unit/thumbnailScheduler.test.ts tests/unit/performanceContract.test.ts tests/unit/productFlowContract.test.ts`

Expected: PASS.

- [x] **Step 6: Commit scheduler and renderer reuse**

```bash
git add src/lib/thumbnailScheduler.ts src/lib/thumbnailRenderer.ts src/lib/modelThumbnailQueue.ts src/components/ModelCardThumbnail.tsx src/components/FolderCardThumbnail.tsx tests/unit/thumbnailScheduler.test.ts tests/unit/performanceContract.test.ts
git commit -m "perf: prioritize and reuse thumbnail rendering"
```

### Task 6: Virtualized Grid and List Rows

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/virtualGrid.ts`
- Modify: `src/components/ModelGrid.tsx`
- Modify: `src/styles.css`
- Test: `tests/unit/virtualGrid.test.ts`
- Modify: `tests/unit/layoutContract.test.ts`
- Modify: `tests/unit/interactionFlowContract.test.ts`

**Interfaces:**
- Produces: `buildVirtualRows<T>(items: T[], columns: number): T[][]`
- Uses: `useVirtualizer` from `@tanstack/react-virtual`
- Preserves all existing ModelGrid callbacks and drag event timing.

- [x] **Step 1: Install React Virtual**

Run: `npm install @tanstack/react-virtual@^3`

- [x] **Step 2: Write failing deterministic row tests**

```ts
it("groups mixed folder and model cards without dropping order", () => {
  expect(buildVirtualRows(["a", "b", "c", "d", "e"], 3)).toEqual([
    ["a", "b", "c"],
    ["d", "e"]
  ]);
});
```

- [x] **Step 3: Implement row grouping and virtualize only the vertical axis**

Keep responsive column calculation in ModelGrid. Give each mode a deterministic estimated row height and use overscan `2`. Render each virtual row as the existing CSS grid so card width remains responsive.

- [x] **Step 4: Preserve interaction semantics**

Keep model IDs as React keys. Do not move `onDragStart`, `onDragEnd`, click, double-click, context-menu, checkbox, or folder-drop handlers behind asynchronous callbacks. Keep selection state in App so unmounting a row cannot clear it.

- [x] **Step 5: Run layout and interaction tests**

Run: `npm test -- tests/unit/virtualGrid.test.ts tests/unit/layoutContract.test.ts tests/unit/interactionFlowContract.test.ts tests/unit/fileDrag.test.ts`

Expected: PASS.

- [x] **Step 6: Commit virtualization**

```bash
git add package.json package-lock.json src/lib/virtualGrid.ts src/components/ModelGrid.tsx src/styles.css tests/unit/virtualGrid.test.ts tests/unit/layoutContract.test.ts tests/unit/interactionFlowContract.test.ts
git commit -m "perf: virtualize large model collections"
```

### Task 7: Recent, Never Opened, Notes, and Tag-Matching Filters

**Files:**
- Modify: `src/lib/folderFilters.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/ModelGrid.tsx`
- Modify: `src/styles.css`
- Test: `tests/unit/folderFilters.test.ts`
- Modify: `tests/unit/productFlowContract.test.ts`

**Interfaces:**
- Adds: `UsageFilter = "all" | "recent" | "never"`
- Adds: `NotesFilter = "all" | "with-notes" | "without-notes"`
- Adds: `TagMatchMode = "all" | "any" | "exclude"`
- Extends `ModelFilterOptions` with `usageFilter`, `notesFilter`, `tagMatchMode`, and `slicerHistory`.

- [x] **Step 1: Write failing pure filter tests**

```ts
it("finds recent and never-opened models from successful slicer history", () => {
  expect(filterModels(models, ALL_FOLDERS_ID, true, "", {
    usageFilter: "never",
    slicerHistory: [{ modelPath: models[0].absolutePath, slicerId: "cura", openedAt: now }]
  })).toEqual([models[1]]);
});

it("supports all, any, and exclude tag modes", () => {
  expect(filterWithTags("any")).toHaveLength(2);
  expect(filterWithTags("exclude")).toHaveLength(1);
});
```

- [x] **Step 2: Implement pure filter semantics**

Recent means at least one successful slicer launch in the last 30 days. Never means no history entry. Notes search joins notes to the existing name/folder/tag search text. Empty selected tags make all tag modes neutral.

- [x] **Step 3: Add compact controls to the existing filter popover**

Use segmented or checkbox rows, not additional permanent toolbar buttons. Show active filter count in the existing filter trigger. `Com notas` and `Sem notas` are mutually exclusive.

- [x] **Step 4: Run filter and product-flow tests**

Run: `npm test -- tests/unit/folderFilters.test.ts tests/unit/productFlowContract.test.ts`

Expected: PASS.

- [x] **Step 5: Commit filters**

```bash
git add src/lib/folderFilters.ts src/App.tsx src/components/ModelGrid.tsx src/styles.css tests/unit/folderFilters.test.ts tests/unit/productFlowContract.test.ts
git commit -m "feat: filter models by usage notes and tag matching"
```

### Task 8: Loading Feedback, Regression, and Performance Verification

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ModelGrid.tsx`
- Modify: `src/styles.css`
- Modify: `tests/unit/productFlowContract.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes watcher state, reconciliation state, and thumbnail queue counters from previous tasks.
- Produces no new privileged API.

- [ ] **Step 1: Add failing feedback contract tests**

Assert source contains distinct labels for `Atualizando biblioteca...`, `Monitoramento ativo`, and watcher fallback; assert cached content is not hidden by the scanning state.

- [ ] **Step 2: Implement restrained status feedback**

Place one compact status near Refresh. Do not put spinners in every card. Keep sticky toolbar height stable in light/dark themes and at minimum window width.

- [ ] **Step 3: Document monitoring, cached startup, and manual refresh**

Add a concise README section explaining that cache lives in app data, original models remain authoritative, and monitoring can be disabled in Settings.

- [ ] **Step 4: Run all unit tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite complete successfully.

- [ ] **Step 6: Manually verify the real library**

Open through `npm run electron:dev`. Verify warm startup shows cached cards before reconciliation, scrolling stays responsive, completed thumbnails remain after scrolling away/back, watcher additions/removals appear once, monitoring toggle persists, Refresh works when monitoring is off, and internal/external drag still behaves exactly as before.

- [ ] **Step 7: Commit final feedback and documentation**

```bash
git add src/App.tsx src/components/ModelGrid.tsx src/styles.css tests/unit/productFlowContract.test.ts README.md
git commit -m "feat: finish responsive library loading flow"
```
