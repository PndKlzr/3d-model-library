# Library Health and Data Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quiet settings-based library health and data maintenance workflow with safe backup/restore, targeted repair actions, and stronger Electron privilege boundaries.

**Architecture:** Extend the existing metadata repository, active library session, index store, and thumbnail cache instead of introducing a database. A small renderer-side health model composes bounded issue facts from existing state, while all filesystem mutations remain behind narrow, session-validated Electron IPC methods.

**Tech Stack:** Electron 44, TypeScript, React 18, Vitest 2, Node.js filesystem APIs, existing portable JSON metadata and thumbnail cache.

**Spec:** `docs/superpowers/specs/2026-09-16-library-health-data-maintenance-design.md`

## Global Constraints

- Keep the main library screen unchanged in the healthy state; maintenance lives in Settings.
- Do not add a database, account, cloud service, telemetry, or network dependency.
- Never modify model files during verification, backup, restore, index rebuild, or cache cleanup.
- Preserve the synchronous native drag path and do not modify native drag behavior.
- Treat backup files, renderer IPC arguments, and cache ownership records as untrusted input.
- Reject stale `LibrarySessionRef` values immediately before every maintenance commit.
- Keep portable metadata paths relative and exclude personal Windows paths from exports.
- Preserve valid thumbnail entries owned by other libraries and unknown legacy entries.
- Package-time fuses, signing, updater behavior, and installer configuration remain out of scope.
- Follow TDD for every task and commit each independently passing deliverable.

---

### Task 1: Trusted IPC and Browser Permission Policy

**Files:**
- Create: `electron/services/ipcSecurity.ts`
- Modify: `electron/main.ts`
- Modify: `src/components/PerformanceDiagnostics.tsx`
- Test: `tests/unit/ipcSecurity.test.ts`
- Test: `tests/unit/preloadContract.test.ts`
- Test: `tests/unit/windowSecurity.test.ts`

**Interfaces:**
- Produces: `createTrustedIpc(ipcMain, getAllowedRendererUrl)` with `handle()` and `on()` registration methods.
- Produces: `denyUnusedPermissions(session)`.
- Consumes later: every production IPC registration in `electron/main.ts` uses the trusted wrapper.

- [ ] **Step 1: Write failing IPC-origin and permission-policy tests**

```ts
it("rejects an invoke from a frame outside the active renderer", async () => {
  const trusted = createTrustedIpc(fakeIpcMain, () => "file:///C:/app/index.html");
  trusted.handle("settings:get", async () => ({ ok: true }));
  await expect(invoke("settings:get", frame("https://example.com/")))
    .rejects.toThrow(/untrusted renderer/i);
});

it("accepts the exact production document and development origin", async () => {
  expect(isTrustedIpcSender(frame("file:///C:/app/index.html#settings"),
    "file:///C:/app/index.html")).toBe(true);
  expect(isTrustedIpcSender(frame("http://127.0.0.1:5173/models"),
    "http://127.0.0.1:5173/")).toBe(true);
});

it("denies every browser permission request", () => {
  const callback = vi.fn();
  denyUnusedPermissions(fakeSession);
  fakeSession.requestPermission("notifications", callback);
  expect(callback).toHaveBeenCalledWith(false);
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm test -- --run tests/unit/ipcSecurity.test.ts tests/unit/preloadContract.test.ts tests/unit/windowSecurity.test.ts`

Expected: FAIL because `ipcSecurity.ts` and the trusted registration wrapper do not exist.

- [ ] **Step 3: Implement the centralized trust boundary**

```ts
export function isTrustedIpcSender(
  senderFrame: { url: string } | null,
  allowedRendererUrl: string
): boolean {
  if (!senderFrame) return false;
  return isAllowedRendererUrl(senderFrame.url, new URL(allowedRendererUrl));
}

export function createTrustedIpc(
  target: Pick<IpcMain, "handle" | "on">,
  getAllowedRendererUrl: () => string
) {
  return {
    handle(channel: string, listener: IpcMainInvokeEventListener) {
      target.handle(channel, (event, ...args) => {
        if (!isTrustedIpcSender(event.senderFrame, getAllowedRendererUrl())) {
          throw new Error("Untrusted renderer IPC request");
        }
        return listener(event, ...args);
      });
    },
    on(channel: string, listener: IpcMainEventListener) {
      target.on(channel, (event, ...args) => {
        if (!isTrustedIpcSender(event.senderFrame, getAllowedRendererUrl())) return;
        listener(event, ...args);
      });
    }
  };
}

export function denyUnusedPermissions(targetSession: PermissionSession): void {
  targetSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  targetSession.setPermissionCheckHandler(() => false);
}
```

Export the existing exact-URL comparison from `windowSecurity.ts` or move it into `ipcSecurity.ts` so navigation and IPC use one rule. Store the renderer URL before registering production handlers. Keep benchmark handlers behind a wrapper configured with the benchmark renderer URL.

- [ ] **Step 4: Route every production `ipcMain.handle/on` registration through the wrapper**

Replace direct registrations inside `registerIpcHandlers()` only. Do not alter handler bodies or channel names. Apply the deny policy to `session.defaultSession` after `app.whenReady()` and before creating the window.

Change diagnostic copying to the existing narrow API:

```ts
await window.modelLibrary.copyText(formatThumbnailDiagnosticReport(snapshot, runtime));
```

Remove the `navigator.clipboard.writeText` call.

- [ ] **Step 5: Run security tests, full tests, and build**

Run: `npm test -- --run tests/unit/ipcSecurity.test.ts tests/unit/preloadContract.test.ts tests/unit/windowSecurity.test.ts`

Run: `npm test -- --run`

Run: `npm run build`

Expected: all tests and build pass; drag implementation files are unchanged.

- [ ] **Step 6: Commit**

```powershell
git add electron/services/ipcSecurity.ts electron/services/windowSecurity.ts electron/main.ts src/components/PerformanceDiagnostics.tsx tests/unit/ipcSecurity.test.ts tests/unit/preloadContract.test.ts tests/unit/windowSecurity.test.ts
git commit -m "Harden privileged Electron IPC"
```

---

### Task 2: Portable Backup Storage and Recovery Snapshots

**Files:**
- Modify: `electron/services/portableMetadataRepository.ts`
- Modify: `electron/services/portableMetadataCodec.ts`
- Test: `tests/unit/portableMetadataRepository.test.ts`
- Test: `tests/unit/portableMetadataSecurity.test.ts`

**Interfaces:**
- Produces: `PortableBackupPreview` and `PortableMetadataRestoreResult`.
- Produces repository methods `readExternalBackup`, `exportBackup`, `restoreBackup`, `getDataDirectory`.
- Consumes: existing `encodePortableMetadata` and `decodePortableMetadata` validation.

- [ ] **Step 1: Add failing repository tests for export, inspection, restore, and retention**

```ts
it("exports only a validated portable manifest with relative paths", async () => {
  await repository.exportBackup(root, manifest, destination);
  const exported = JSON.parse(await readFile(destination, "utf8"));
  expect(Object.keys(exported.models)).toEqual(["parts/model.stl"]);
  expect(JSON.stringify(exported)).not.toContain(root);
});

it("rejects oversized and traversal-bearing external backups before restore", async () => {
  await writeFile(source, JSON.stringify({ ...manifest, models: { "../escape.stl": metadata } }));
  await expect(repository.readExternalBackup(root, source)).rejects.toThrow(/escape|relative/i);
});

it("snapshots the current manifest before replacing it and retains five snapshots", async () => {
  for (let index = 0; index < 7; index += 1) {
    await repository.restoreBackup(root, current(index), replacement(index));
  }
  const snapshots = (await readdir(dataDirectory)).filter(isRecoverySnapshot);
  expect(snapshots).toHaveLength(5);
});

it("leaves the primary unchanged when replacement fails", async () => {
  await expect(failingRepository.restoreBackup(root, current, replacement)).rejects.toThrow();
  expect(await repository.load(root)).toMatchObject({ manifest: current });
});
```

- [ ] **Step 2: Run repository tests and confirm RED**

Run: `npm test -- --run tests/unit/portableMetadataRepository.test.ts tests/unit/portableMetadataSecurity.test.ts`

Expected: FAIL because external backup and recovery snapshot operations are absent.

- [ ] **Step 3: Add bounded backup types and external-file validation**

```ts
export type PortableBackupPreview = {
  libraryId: string;
  updatedAt: string;
  modelCount: number;
  tagCount: number;
  historyCount: number;
};

export type PortableMetadataRestoreResult = {
  manifest: PortableLibraryManifestV1;
  snapshotPath: string;
};
```

`readExternalBackup(rootPath, filePath)` must resolve a regular file, reject symbolic links, enforce `MAX_PORTABLE_METADATA_BYTES` before reading, parse JSON once, and call `decodePortableMetadata(rootPath, value)` before returning `{ manifest, preview }`.

- [ ] **Step 4: Implement atomic export and restore**

`exportBackup` validates the manifest, writes a sibling random `.tmp`, syncs it, and renames it to the dialog-selected `.json` destination. `restoreBackup` validates both manifests, writes the current manifest to:

```text
.3d-model-library/3D_LIBRARY_DATA_RECOVERY_YYYY-MM-DDTHH-mm-ss-sssZ.json
```

Then install the replacement through the existing atomic `save`. Keep the newest five recovery snapshots sorted by timestamp; remove only files matching the exact recovery filename pattern.

`getDataDirectory(rootPath)` canonicalizes the root and returns the exact child `.3d-model-library` path after ensuring it exists and is hidden.

- [ ] **Step 5: Run focused tests and verify PASS**

Run: `npm test -- --run tests/unit/portableMetadataRepository.test.ts tests/unit/portableMetadataSecurity.test.ts`

Expected: all focused tests pass.

- [ ] **Step 6: Commit**

```powershell
git add electron/services/portableMetadataCodec.ts electron/services/portableMetadataRepository.ts tests/unit/portableMetadataRepository.test.ts tests/unit/portableMetadataSecurity.test.ts
git commit -m "Add portable metadata backup storage"
```

---

### Task 3: Active Metadata Backup and Restore Workflow

**Files:**
- Modify: `electron/services/activeLibraryMetadataStore.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/preload.d.ts`
- Test: `tests/unit/activeLibraryMetadataStore.test.ts`
- Test: `tests/unit/preloadContract.test.ts`

**Interfaces:**
- Consumes: repository backup methods from Task 2.
- Produces: `LibraryDataStatus`, `LibraryBackupActionResult`, and task-specific preload methods.
- Produces active-store methods `getDataStatus`, `exportManifest`, and `restoreManifest`.

- [ ] **Step 1: Write failing active-store tests**

```ts
it("serializes restore behind metadata mutations and adopts the active library identity", async () => {
  const mutation = store.setNotes(modelPath, "before restore");
  const restored = store.restoreManifest(foreignManifest);
  await Promise.all([mutation, restored]);
  expect(repository.restoreBackup).toHaveBeenCalledWith(
    root,
    expect.objectContaining({ libraryId: activeLibraryId }),
    expect.objectContaining({ libraryId: activeLibraryId })
  );
  expect(store.getMetadata().models[modelPath].notes).toBe("from backup");
});

it("keeps current metadata when repository restore fails", async () => {
  repository.restoreBackup.mockRejectedValueOnce(new Error("disk full"));
  await expect(store.restoreManifest(validBackup)).rejects.toThrow("disk full");
  expect(store.getMetadata()).toEqual(before);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- --run tests/unit/activeLibraryMetadataStore.test.ts tests/unit/preloadContract.test.ts`

Expected: FAIL because restore/export interfaces are absent.

- [ ] **Step 3: Define shared result types**

```ts
export type LibraryDataStatus = {
  libraryId: string | null;
  updatedAt: string | null;
  availability: LibraryMetadataAvailability;
  writable: boolean;
  source: LibraryMetadataStatus["source"];
  modelCount: number;
  tagCount: number;
};

export type LibraryBackupActionResult = {
  state: "cancelled" | "exported" | "restored";
  message: string;
  metadata?: LibraryMetadata;
  metadataStatus?: LibraryMetadataStatus;
};
```

Track `updatedAt` from the loaded manifest and successful mutations without adding it to durable user metadata.

- [ ] **Step 4: Implement queued active-store operations**

`exportManifest()` returns a validated manifest from the current in-memory state and is available for valid mirror data. `restoreManifest(rawManifest)` runs on `mutationTail`, requires a writable active root, decodes against that root, re-encodes with the active `libraryId` and current timestamp, calls `repository.restoreBackup`, then updates in-memory metadata, status, timestamp, and mirror only after success.

- [ ] **Step 5: Add native-dialog IPC workflows**

Add preload methods:

```ts
getLibraryDataStatus(): Promise<LibraryDataStatus>;
exportLibraryBackup(session: LibrarySessionRef): Promise<LibraryBackupActionResult>;
restoreLibraryBackup(session: LibrarySessionRef): Promise<LibraryBackupActionResult>;
```

Export uses `dialog.showSaveDialog` with JSON filtering and a timestamped default name. Restore uses `dialog.showOpenDialog`, repository inspection, then `dialog.showMessageBox` showing backup date, counts, and library match/mismatch. It calls `activeLibrarySession.publishIfCurrent(session, ...)` immediately before restore and returns refreshed metadata/status.

- [ ] **Step 6: Run focused tests, full tests, and build**

Run: `npm test -- --run tests/unit/activeLibraryMetadataStore.test.ts tests/unit/preloadContract.test.ts`

Run: `npm test -- --run`

Run: `npm run build`

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add electron/services/activeLibraryMetadataStore.ts electron/main.ts electron/preload.cjs src/shared/types.ts src/shared/preload.d.ts tests/unit/activeLibraryMetadataStore.test.ts tests/unit/preloadContract.test.ts
git commit -m "Add library metadata backup workflow"
```

---

### Task 4: Session-Safe Index Rebuild and Data Folder Reveal

**Files:**
- Modify: `electron/services/libraryIndexStore.ts`
- Modify: `electron/services/activeLibrarySession.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/preload.d.ts`
- Test: `tests/unit/libraryIndexStore.test.ts`
- Test: `tests/unit/activeLibrarySession.test.ts`
- Test: `tests/unit/libraryFolder.test.ts`

**Interfaces:**
- Produces: `LibraryIndexStore.invalidate(rootPath, libraryId)`.
- Produces: `ActiveLibrarySession.rebuildIndex(session)`.
- Produces preload methods `rebuildLibraryIndex(session)` and `showLibraryDataFolder(session)`.

- [ ] **Step 1: Write failing index and stale-session tests**

```ts
it("invalidates only the disposable index", async () => {
  await store.invalidate(root, libraryId);
  await expect(store.load(root, libraryId)).resolves.toBeNull();
  await expect(readFile(durableMetadataPath, "utf8")).resolves.toBe(durableMetadata);
});

it("does not publish a rebuild after the active library changes", async () => {
  const rebuilding = session.rebuildIndex(libraryA.session);
  await session.activate(libraryB.root, false);
  await expect(rebuilding).rejects.toThrow(/stale/i);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- --run tests/unit/libraryIndexStore.test.ts tests/unit/activeLibrarySession.test.ts tests/unit/libraryFolder.test.ts`

Expected: FAIL because invalidation and rebuild methods do not exist.

- [ ] **Step 3: Implement exact index invalidation**

Reuse the store's canonical root and index path validation. `invalidate` unlinks only `LIBRARY_INDEX_DO_NOT_DELETE.json`, ignores `ENOENT`, and rejects stale library identity in the file if one is present.

- [ ] **Step 4: Implement rebuild through the catalog queue**

```ts
async rebuildIndex(expected) {
  assertCurrent(expected);
  return enqueueCatalogMutation(async () => {
    assertCurrent(expected);
    await indexStore.invalidate(expected.rootPath, expected.libraryId);
    const result = await scanRoot(expected.rootPath);
    assertCurrent(expected);
    await indexStore.save(expected.rootPath, expected.libraryId, result);
    assertCurrent(expected);
    return structuredClone({ session: expected, result });
  });
}
```

Add trusted IPC handlers. `showLibraryDataFolder` obtains the directory from the repository, validates the session again, and calls `shell.openPath` only for that exact directory.

- [ ] **Step 5: Run focused tests and build**

Run: `npm test -- --run tests/unit/libraryIndexStore.test.ts tests/unit/activeLibrarySession.test.ts tests/unit/libraryFolder.test.ts`

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add electron/services/libraryIndexStore.ts electron/services/activeLibrarySession.ts electron/main.ts electron/preload.cjs src/shared/preload.d.ts tests/unit/libraryIndexStore.test.ts tests/unit/activeLibrarySession.test.ts tests/unit/libraryFolder.test.ts
git commit -m "Add safe library index maintenance"
```

---

### Task 5: Per-Library Thumbnail Ownership and Cleanup

**Files:**
- Modify: `electron/services/thumbnailCache.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/preload.d.ts`
- Test: `tests/unit/thumbnailCache.test.ts`
- Test: `tests/unit/preloadContract.test.ts`

**Interfaces:**
- Produces: `ThumbnailCacheOwner`, `ThumbnailCleanupResult`.
- Produces: `thumbnailCache.cleanLibrary(libraryId, currentSignatures)`.
- Produces preload method `cleanUnusedThumbnails(session, models)`.

- [ ] **Step 1: Add failing ownership isolation tests**

```ts
it("removes stale entries owned by the active library only", async () => {
  await cache.write(oldA, image, owner("library-a", "old.stl"));
  await cache.write(currentA, image, owner("library-a", "current.stl"));
  await cache.write(modelB, image, owner("library-b", "other.stl"));
  const result = await cache.cleanLibrary("library-a", [currentA]);
  expect(result.removedFiles).toBe(1);
  await expect(cache.read(modelB)).resolves.toBe(image);
});

it("preserves legacy entries without ownership records", async () => {
  await writeLegacyEntry(cacheDirectory, legacyModel, image);
  await cache.cleanLibrary("library-a", []);
  await expect(cache.read(legacyModel)).resolves.toBe(image);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- --run tests/unit/thumbnailCache.test.ts tests/unit/preloadContract.test.ts`

Expected: FAIL because cache ownership and targeted cleanup are absent.

- [ ] **Step 3: Add bounded ownership records**

```ts
export type ThumbnailCacheOwner = {
  libraryId: string;
  relativePath: string;
};

export type ThumbnailCleanupResult = {
  removedFiles: number;
  reclaimedBytes: number;
};
```

Write `<cache-key>.meta.json` atomically after the image publication commits. The record contains schema version, cache key, library ID, relative path, size, modified time, renderer version, and last access timestamp. Validate maximum field lengths and reject absolute/traversal paths when reading sidecars.

- [ ] **Step 4: Implement targeted cleanup and legacy behavior**

`cleanLibrary(libraryId, currentSignatures)` computes the active set of current keys. It removes an image and sidecar only when a valid sidecar names `libraryId` and its key is absent from the active set. Malformed sidecars are removed without deleting an otherwise valid legacy image. Extend pruning to read each candidate's bounded signature bytes and remove PNG, JPEG, or WebP files whose signatures are invalid; then apply the existing age, temporary-file, and size policies. Return the actual removed image count and bytes.

Pass owner data from the trusted main-process thumbnail read/write handlers using the current session and `path.relative(session.rootPath, model.absolutePath)`. The renderer never chooses a library ID or relative ownership path.

- [ ] **Step 5: Add the cleanup IPC method with session validation**

The renderer sends the active `LibrarySessionRef` and current `ModelFile[]`. The main process verifies the session and canonical containment for every signature, derives ownership itself, runs cleanup, verifies the session again, and returns `ThumbnailCleanupResult`.

- [ ] **Step 6: Run focused tests, full tests, and build**

Run: `npm test -- --run tests/unit/thumbnailCache.test.ts tests/unit/preloadContract.test.ts`

Run: `npm test -- --run`

Run: `npm run build`

Expected: all pass and benchmark cache behavior remains covered.

- [ ] **Step 7: Commit**

```powershell
git add electron/services/thumbnailCache.ts electron/main.ts electron/preload.cjs src/shared/types.ts src/shared/preload.d.ts tests/unit/thumbnailCache.test.ts tests/unit/preloadContract.test.ts
git commit -m "Track thumbnail cache ownership"
```

---

### Task 6: Bounded Library Health Model and Read-Only Verification

**Files:**
- Create: `src/lib/librarySessionIssueRegistry.ts`
- Create: `src/lib/libraryHealth.ts`
- Modify: `electron/services/activeLibrarySession.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/lib/modelThumbnailService.ts`
- Modify: `src/components/DetailsPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/preload.d.ts`
- Test: `tests/unit/librarySessionIssueRegistry.test.ts`
- Test: `tests/unit/libraryHealth.test.ts`
- Test: `tests/unit/modelThumbnailService.test.ts`
- Test: `tests/unit/activeLibrarySession.test.ts`
- Test: `tests/unit/DetailsPanel.test.tsx`

**Interfaces:**
- Produces: `librarySessionIssueRegistry.record`, `.resolve`, `.reset`, `.getSnapshot`, `.subscribe` for thumbnail and archive failures.
- Produces: `buildLibraryHealthSnapshot(input): LibraryHealthSnapshot`.
- Produces: `ActiveLibrarySession.verify(session)` and preload method `verifyLibrary(session)`.
- Consumes later: Settings UI from Task 7.

- [ ] **Step 1: Write failing registry and aggregation tests**

```ts
it("bounds session issues and clears a model after a successful retry", () => {
  const registry = createLibrarySessionIssueRegistry(2);
  registry.record("thumbnail", modelA, new Error("A"));
  registry.record("thumbnail", modelB, new Error("B"));
  registry.record("archive", modelC, new Error("C"));
  expect(registry.getSnapshot().map((item) => item.modelPath)).toEqual([modelB, modelC]);
  registry.resolve("archive", modelC);
  expect(registry.getSnapshot().map((item) => item.modelPath)).toEqual([modelB]);
});

it("combines missing metadata paths, scan errors, thumbnail failures, and slicers", () => {
  const health = buildLibraryHealthSnapshot(input);
  expect(health.counts).toEqual({ warning: 2, error: 2 });
  expect(health.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
    "metadata-file-missing", "scan-error", "thumbnail-failed", "archive-read-failed",
    "slicer-unavailable"
  ]));
});

it("verifies without publishing or saving a new catalog", async () => {
  const verified = await session.verify(active.session);
  expect(verified.result.models).toHaveLength(1);
  expect(indexStore.save).not.toHaveBeenCalled();
  expect(session.current()).toEqual(active.session);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- --run tests/unit/librarySessionIssueRegistry.test.ts tests/unit/libraryHealth.test.ts tests/unit/modelThumbnailService.test.ts tests/unit/activeLibrarySession.test.ts tests/unit/DetailsPanel.test.tsx`

Expected: FAIL because the health model and registry are absent.

- [ ] **Step 3: Define bounded issue facts**

```ts
export type LibraryHealthIssueCode =
  | "metadata-recovered-backup"
  | "metadata-read-only"
  | "metadata-unavailable"
  | "metadata-file-missing"
  | "scan-error"
  | "thumbnail-failed"
  | "archive-read-failed"
  | "slicer-unavailable"
  | "monitoring-failed";

export type LibraryHealthIssue = {
  id: string;
  code: LibraryHealthIssueCode;
  severity: "warning" | "error";
  relativePath?: string;
  detail?: string;
};

export type LibraryHealthSnapshot = {
  checkedAt: string | null;
  counts: { warning: number; error: number };
  issues: LibraryHealthIssue[];
};
```

Limit issue details to 500 characters and the snapshot to 250 issues. Normalize paths relative to the active library before they enter the snapshot.

- [ ] **Step 4: Connect thumbnail and archive success/failure events**

Add optional hooks to `createModelThumbnailService`:

```ts
onFailure?: (model: ModelFile, error: Error) => void;
onSuccess?: (model: ModelFile) => void;
```

Call `record("thumbnail", ...)` only after all thumbnail strategies fail. Call `resolve("thumbnail", ...)` on cache, embedded, or render success. Add `onArchiveFailure` and `onArchiveSuccess` callbacks to `DetailsPanel`; record only a failed archive listing and resolve it after a successful listing. Reset the registry in the existing library-session reset path so one library cannot display another library's paths.

- [ ] **Step 5: Add an explicitly read-only verification API**

Add `ActiveLibrarySession.verify(expected)` beside `scan(expected)`. It runs `scanRoot(expected.rootPath)` inside the catalog queue, validates the session before and after the scan, and returns `{ session, result }` without calling `indexStore.save`, publishing watcher events, or replacing the mounted catalog. Expose it through trusted `library:verify` IPC and `verifyLibrary(session)` in the preload contract.

- [ ] **Step 6: Compose health in `App` without rescanning on render**

Use memoized current scan, metadata/status, session issues, monitoring error, and unavailable slicer IDs. Compare durable metadata paths against the current or verified scan to emit `metadata-file-missing`. “Verify library” calls `verifyLibrary`, inspects configured slicers, keeps the displayed catalog unchanged, and sets `checkedAt`; ordinary filter, search, scroll, and selection changes never trigger verification.

- [ ] **Step 7: Run focused tests and commit**

Run: `npm test -- --run tests/unit/librarySessionIssueRegistry.test.ts tests/unit/libraryHealth.test.ts tests/unit/modelThumbnailService.test.ts tests/unit/activeLibrarySession.test.ts tests/unit/DetailsPanel.test.tsx`

Expected: PASS.

```powershell
git add src/lib/librarySessionIssueRegistry.ts src/lib/libraryHealth.ts electron/services/activeLibrarySession.ts electron/main.ts electron/preload.cjs src/lib/modelThumbnailService.ts src/components/DetailsPanel.tsx src/App.tsx src/shared/types.ts src/shared/preload.d.ts tests/unit/librarySessionIssueRegistry.test.ts tests/unit/libraryHealth.test.ts tests/unit/modelThumbnailService.test.ts tests/unit/activeLibrarySession.test.ts tests/unit/DetailsPanel.test.tsx
git commit -m "Add bounded library health tracking"
```

---

### Task 7: Data and Maintenance Settings UI

**Files:**
- Create: `src/components/LibraryMaintenanceSettings.tsx`
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/App.tsx`
- Modify: `src/i18n/catalog.ts`
- Modify: `src/styles.css`
- Test: `tests/unit/LibraryMaintenanceSettings.test.tsx`
- Test: `tests/unit/layoutContract.test.ts`
- Test: `tests/unit/localizedRendererContract.test.ts`

**Interfaces:**
- Consumes: backup APIs from Task 3, index/data-folder APIs from Task 4, cache cleanup from Task 5, and health snapshot from Task 6.
- Produces: one responsive Settings tab with no healthy-state main-toolbar clutter.

- [ ] **Step 1: Write failing component behavior tests**

```tsx
it("shows a calm healthy state and groups maintenance actions", async () => {
  render(<LibraryMaintenanceSettings {...healthyProps} />);
  expect(screen.getByText("Library protected")).toBeVisible();
  expect(screen.getByRole("button", { name: "Export backup" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Rebuild index" })).toBeVisible();
  expect(screen.queryByText("Problems found")).not.toBeInTheDocument();
});

it("confirms index rebuild and disables only its own conflicting actions", async () => {
  render(<LibraryMaintenanceSettings {...props} />);
  await user.click(screen.getByRole("button", { name: "Rebuild index" }));
  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ kind: "rebuild-index" }));
});
```

- [ ] **Step 2: Run UI tests and confirm RED**

Run: `npm test -- --run tests/unit/LibraryMaintenanceSettings.test.tsx tests/unit/layoutContract.test.ts tests/unit/localizedRendererContract.test.ts`

Expected: FAIL because the component and translations do not exist.

- [ ] **Step 3: Add the settings tab and focused component**

Extend `SettingsTab` with `"maintenance"` and use a `DatabaseBackup` or `ShieldCheck` Lucide icon. `LibraryMaintenanceSettings` receives data only through props:

```ts
type LibraryMaintenanceSettingsProps = {
  dataStatus: LibraryDataStatus;
  health: LibraryHealthSnapshot;
  busyAction: MaintenanceAction | null;
  onExportBackup(): Promise<void>;
  onRestoreBackup(): Promise<void>;
  onOpenDataFolder(): Promise<void>;
  onVerify(): Promise<void>;
  onRebuildIndex(): Promise<void>;
  onCleanThumbnails(): Promise<void>;
  onRetryThumbnail(relativePath: string): void;
};
```

Render three unframed settings sections. Use compact status rows, ordinary command buttons, and confirmation dialogs for restore and index rebuild. Do not nest cards and do not add permanent explanatory banners.

- [ ] **Step 4: Wire operations in `App` with session guards**

Each handler captures `activeLibrarySessionRef.current`, sets one `busyAction`, calls the preload method, checks `isCurrentLibraryResult`, updates only returned state, and sets the existing operation message. `finally` clears the busy action only if the same operation still owns it.

After restore, replace renderer metadata/status from the result. After rebuild, replace the scan result and preserve valid selection/scroll using the existing committed-update helpers. After cleanup, report removed count and reclaimed size without clearing mounted valid thumbnails.

- [ ] **Step 5: Add Portuguese and English copy**

Add matching keys for tab label, section titles, healthy/read-only/error states, backup actions, confirmation text, maintenance actions, issue categories, progress, cancel, and success/error summaries. Keep button labels short enough for the 760 px minimum window.

- [ ] **Step 6: Add responsive styling and attention indicator**

At narrow dialog widths, stack action rows and keep buttons full-width without overlap. The Settings toolbar button receives a small semantic attention dot only when `health.counts.error > 0` or a writable recovery action is required. The dot has an accessible label and is absent in healthy and warning-only states.

- [ ] **Step 7: Run UI tests, full tests, and build**

Run: `npm test -- --run tests/unit/LibraryMaintenanceSettings.test.tsx tests/unit/layoutContract.test.ts tests/unit/localizedRendererContract.test.ts`

Run: `npm test -- --run`

Run: `npm run build`

Expected: all pass with no missing translation contract entries.

- [ ] **Step 8: Commit**

```powershell
git add src/components/LibraryMaintenanceSettings.tsx src/components/SettingsDialog.tsx src/App.tsx src/i18n/catalog.ts src/styles.css tests/unit/LibraryMaintenanceSettings.test.tsx tests/unit/layoutContract.test.ts tests/unit/localizedRendererContract.test.ts
git commit -m "Add library data maintenance settings"
```

---

### Task 8: Release Evidence and Regression Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/security/release-readiness-2026-09-16.md`
- Create: `docs/maintenance/library-data-recovery.md`
- Test: all automated suites

**Interfaces:**
- Consumes: completed Tasks 1-7.
- Produces: user-facing recovery instructions and final verification evidence.

- [ ] **Step 1: Document exact backup and maintenance behavior**

Document:

- what the exported backup includes and excludes;
- how cross-computer restore works;
- where automatic recovery snapshots live;
- the five-snapshot retention rule;
- the difference between durable metadata, disposable index, and thumbnail cache;
- what each maintenance button can delete;
- that model files are never modified by maintenance;
- that package fuses/signing remain installer work.

- [ ] **Step 2: Run static privacy and repository checks**

Run:

```powershell
git diff --check
rg -n "C:\\Users\\Pnd|AppData\\Roaming\\model-library|BEGIN (RSA |OPENSSH )?PRIVATE KEY|api[_-]?key|token" README.md docs electron src tests
git status --short
```

Expected: no personal library path, credential, generated binary, or unrelated staged file. Leave `.superpowers/` untracked and untouched.

- [ ] **Step 3: Run complete automated verification**

Run:

```powershell
npm audit --omit=dev
npm test -- --run
npm run build
```

Expected: runtime audit reports zero vulnerabilities; all tests pass; production build succeeds. Record the exact counts in the release-readiness document.

- [ ] **Step 4: Perform manual acceptance with the user**

Ask the user to verify these actions in the launched development app:

1. Export a backup, change one note, restore, and confirm the old note returns.
2. Rebuild the index and confirm tags, notes, favorites, and files remain.
3. Clean unused thumbnails and reopen a second library without losing valid cached thumbnails.
4. Trigger/retry one thumbnail failure and confirm the problem disappears.
5. Disable or rename a slicer executable temporarily and confirm the health issue appears.
6. Drag STL and 3MF to Cura.
7. Drag STL and 3MF to Creality Print.
8. Drag a file to Explorer/Desktop.
9. Move a model to an internal folder.

- [ ] **Step 5: Commit documentation and verification evidence**

```powershell
git add README.md docs/security/release-readiness-2026-09-16.md docs/maintenance/library-data-recovery.md
git commit -m "Document library maintenance verification"
```
