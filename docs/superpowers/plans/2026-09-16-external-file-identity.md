# External File Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve tags, notes, favorites, and slicer history when Windows Explorer renames or moves files and folders inside the active library.

**Architecture:** Extend the existing portable metadata document with content identities, compute SHA-256 only for files carrying durable user data, and reconcile watcher/full-scan removals with unique content-identical additions. Keep hashing streamed and serialized, and keep all path migrations atomic inside the existing metadata mutation queue.

**Tech Stack:** Electron 44, Node.js streams/crypto, TypeScript, Chokidar, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-external-file-identity-design.md`

## Global Constraints

- Never associate metadata using only filename, size, timestamp, or watcher timing.
- Automatic migration requires one unique missing source and one unique added destination with the same SHA-256 digest.
- Never follow or write a path outside the active canonical library root.
- Hash files through streams with one concurrent background job.
- Existing schema-version-1 metadata must remain readable.
- Internal rename, move, undo, and library-session generation protections must not regress.

---

### Task 1: Portable identity schema

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `electron/services/portableMetadataCodec.ts`
- Modify: `electron/services/portableMetadataRepository.ts`
- Modify: `electron/services/activeLibraryMetadataStore.ts`
- Modify: `electron/services/libraryMetadataStore.ts`
- Test: `tests/unit/portableMetadataCodec.test.ts`
- Test: `tests/unit/portableMetadataRepository.test.ts`
- Test: `tests/unit/portableMetadataSecurity.test.ts`
- Test: `tests/unit/libraryMetadataStore.test.ts`

**Interfaces:**
- Produces: `FileContentIdentity` and `LibraryMetadata.fileIdentities`.
- Produces: schema-version-2 manifests while decoding both versions 1 and 2.

- [ ] **Step 1: Write failing compatibility and round-trip tests**

Add tests proving a version-1 manifest decodes with an empty identity map and a version-2 manifest stores identity paths relatively:

```ts
expect(decodePortableMetadata(rootPath, v1Manifest).metadata.fileIdentities).toEqual({});

const metadata = {
  models: { [modelPath]: { favorite: true, tags: [], notes: "" } },
  tagCatalog: [],
  slicerHistory: [],
  fileIdentities: {
    [modelPath]: {
      algorithm: "sha256" as const,
      digest: "a".repeat(64),
      sizeBytes: 42,
      modifiedAt: "2026-09-16T10:00:00.000Z"
    }
  }
};
const manifest = encodePortableMetadata(rootPath, "library-id", metadata);
expect(manifest.fileIdentities).toHaveProperty("Brinquedos/acao + teste.3mf");
expect(decodePortableMetadata(rootPath, manifest).metadata.fileIdentities[modelPath])
  .toEqual(metadata.fileIdentities[modelPath]);
```

- [ ] **Step 2: Run focused tests and confirm the expected type/schema failures**

Run: `npm test -- tests/unit/portableMetadataCodec.test.ts tests/unit/libraryMetadataStore.test.ts`

Expected: FAIL because identities and schema v2 do not exist.

- [ ] **Step 3: Add identity types and normalized defaults**

Add these shared shapes:

```ts
export type FileContentIdentity = {
  algorithm: "sha256";
  digest: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type LibraryMetadata = {
  models: Record<string, ModelUserMetadata>;
  tagCatalog: string[];
  slicerHistory: SlicerHistoryEntry[];
  fileIdentities: Record<string, FileContentIdentity>;
};
```

Update `createDefaultLibraryMetadata`, normalization, and cloning so missing identities become `{}` and malformed digest/size/timestamp records are discarded.

- [ ] **Step 4: Implement schema-v2 encoding with schema-v1 decoding**

Define `PortableLibraryManifestV2` and `PortableLibraryManifest = PortableLibraryManifestV1 | PortableLibraryManifestV2`. Emit version 2, validate 64-character lowercase hexadecimal digests, convert identity keys with `toPortableRelativePath`, and keep the existing path-containment checks. Branch decoding by schema version instead of rejecting version 1. Repository load/backup APIs accept the union; new saves and exports use version 2. Update the active-store and repository test harness types accordingly.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- tests/unit/portableMetadataCodec.test.ts tests/unit/portableMetadataRepository.test.ts tests/unit/portableMetadataSecurity.test.ts tests/unit/libraryMetadataStore.test.ts`

Expected: PASS.

Commit: `git commit -am "feat: store portable file identities"`

---

### Task 2: Atomic identity-aware metadata movement

**Files:**
- Modify: `electron/services/libraryMetadataStore.ts`
- Modify: `electron/services/activeLibraryMetadataStore.ts`
- Modify: `electron/services/libraryMetadataMirrorStore.ts`
- Test: `tests/unit/libraryMetadataStore.test.ts`
- Test: `tests/unit/activeLibraryMetadataStore.test.ts`

**Interfaces:**
- Produces: `LibraryMetadataStore.setFileIdentity(modelPath, identity)`.
- Produces: `ActiveLibraryMetadataStore.movePathMetadataBatch(moves)`.
- Consumes: `FileContentIdentity` from Task 1.

- [ ] **Step 1: Write failing tests for identity lifecycle**

Cover setting an identity, moving metadata plus identity plus slicer history together, moving a folder with multiple identities, and replacing stale destination data:

```ts
store.setFileIdentity(oldPath, identity);
store.movePathMetadata(oldPath, nextPath);
expect(store.getMetadata().fileIdentities[oldPath]).toBeUndefined();
expect(store.getMetadata().fileIdentities[path.resolve(nextPath)]).toEqual(identity);
```

Add an active-store test where two path moves are persisted in one repository save through `movePathMetadataBatch`.

- [ ] **Step 2: Run focused tests and confirm they fail on missing APIs**

Run: `npm test -- tests/unit/libraryMetadataStore.test.ts tests/unit/activeLibraryMetadataStore.test.ts`

- [ ] **Step 3: Implement identity-aware reducers and atomic batch movement**

Extend the reducer with:

```ts
setFileIdentity(modelPath: string, identity: FileContentIdentity): LibraryMetadata;
movePathMetadataBatch(
  moves: Array<{ sourcePath: string; destinationPath: string }>
): LibraryMetadata;
```

Implement batch movement by applying all source-to-destination mappings to models, identities, and slicer history in one reducer result. Reject duplicate source or destination paths before writing.

- [ ] **Step 4: Persist and mirror the complete metadata atomically**

Expose the batch method through `ActiveLibraryMetadataStore`, validate every source and destination against the active root, and perform one queued manifest save. Confirm mirror cloning keeps identities.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- tests/unit/libraryMetadataStore.test.ts tests/unit/activeLibraryMetadataStore.test.ts`

Expected: PASS.

Commit: `git commit -am "feat: move file identities with metadata"`

---

### Task 3: Safe streamed identity generation

**Files:**
- Create: `electron/services/fileIdentityService.ts`
- Modify: `electron/services/activeLibraryMetadataStore.ts`
- Test: `tests/unit/fileIdentityService.test.ts`
- Test: `tests/unit/activeLibraryMetadataStore.test.ts`

**Interfaces:**
- Produces: `computeStableFileIdentity(absolutePath): Promise<FileContentIdentity | null>`.
- Produces: `ActiveLibraryMetadataStore.ensureFileIdentities(models): Promise<void>`.
- Consumes: `ModelHashInput[]`-compatible model signatures.

- [ ] **Step 1: Write failing stable-hash tests**

Test a streamed SHA-256 result, rejection when size or modification time changes between pre/post `stat`, and serialized execution:

```ts
const identity = await computeStableFileIdentity(filePath);
expect(identity).toMatchObject({
  algorithm: "sha256",
  digest: createHash("sha256").update(contents).digest("hex"),
  sizeBytes: contents.length
});
```

Use injected `statFile` and `hashFile` functions to prove the changed-file case returns `null` rather than persisting a stale digest.

- [ ] **Step 2: Run the new test and verify RED**

Run: `npm test -- tests/unit/fileIdentityService.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement streamed hashing and a one-worker queue**

Hash through `createReadStream`, compare `size` and `mtime.toISOString()` before and after reading, and expose a FIFO queue with concurrency fixed at one. Do not read full files into memory.

- [ ] **Step 4: Add bounded backfill to the active metadata store**

`ensureFileIdentities(models)` filters to paths with durable data and no current matching identity. Durable data is favorite, tags, non-empty notes, or slicer history. Each completed result rechecks the active root token and the current model signature before committing through the metadata mutation queue.

Metadata edits return as soon as their primary metadata save succeeds; they enqueue identity work afterward. Activation/full scan passes eligible models into the same queue to backfill old libraries gradually.

- [ ] **Step 5: Test stale-session and stale-file rejection**

Add tests proving an identity finishing after `open()` switches roots is discarded and a metadata save remains valid if hashing fails.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- tests/unit/fileIdentityService.test.ts tests/unit/activeLibraryMetadataStore.test.ts`

Expected: PASS.

Commit: `git add electron/services/fileIdentityService.ts tests/unit/fileIdentityService.test.ts electron/services/activeLibraryMetadataStore.ts tests/unit/activeLibraryMetadataStore.test.ts && git commit -m "feat: generate durable file identities"`

---

### Task 4: Unique external rename reconciliation

**Files:**
- Create: `electron/services/externalMetadataReconciler.ts`
- Modify: `electron/services/activeLibrarySession.ts`
- Test: `tests/unit/externalMetadataReconciler.test.ts`
- Test: `tests/unit/activeLibrarySession.test.ts`

**Interfaces:**
- Produces: `reconcileExternalMetadataMoves(input): Promise<MetadataPathMove[]>`.
- Consumes: previous/current scans, current metadata identities, and `computeStableFileIdentity`.
- Calls: `ActiveLibraryMetadataStore.movePathMetadataBatch(moves)`.

- [ ] **Step 1: Write failing reconciliation tests**

Cover a single file rename, a parent-folder rename with multiple files, a move detected by a full scan, an addition with a different digest, duplicate-content ambiguity on either side, and paths outside the root.

The core assertion for ambiguity is:

```ts
expect(await reconcileExternalMetadataMoves({
  previousScan,
  nextScan,
  metadata: metadataWithDuplicateIdentities,
  identifyAddedFile
})).toEqual([]);
```

- [ ] **Step 2: Run reconciliation tests and verify RED**

Run: `npm test -- tests/unit/externalMetadataReconciler.test.ts`

- [ ] **Step 3: Implement candidate filtering and unique matching**

Diff normalized paths between scans. Keep removed paths only when they have durable metadata and a saved identity. Filter added models by matching size before hashing. Group sources and additions by digest, and emit a move only where each group has exactly one source and one destination.

- [ ] **Step 4: Integrate watcher batches**

In `buildWatcher`, retain the pre-event scan, apply events, reconcile, persist one metadata batch, then save the new index and publish `onChanged`. Catch reconciliation failures separately so physical catalog updates still complete and the watcher stays active.

- [ ] **Step 5: Integrate full scans and session guards**

Use the same reconciliation before replacing a cached index in `scan` and `rebuildIndex`. Assert the captured session before hashing, before metadata migration, and before index save. Schedule identity backfill after a successful current-session scan.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- tests/unit/externalMetadataReconciler.test.ts tests/unit/activeLibrarySession.test.ts tests/unit/libraryScanner.test.ts tests/unit/libraryWatcher.test.ts`

Expected: PASS.

Commit: `git add electron/services/externalMetadataReconciler.ts tests/unit/externalMetadataReconciler.test.ts electron/services/activeLibrarySession.ts tests/unit/activeLibrarySession.test.ts && git commit -m "feat: reconcile external model renames"`

---

### Task 5: Recovery visibility and active-library diagnostics

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/lib/libraryHealth.ts`
- Modify: `src/lib/thumbnailDiagnostics.ts`
- Modify: `src/components/PerformanceDiagnostics.tsx`
- Modify: `src/App.tsx`
- Modify: `src/i18n/catalog.ts`
- Test: `tests/unit/libraryHealth.test.ts`
- Test: `tests/unit/thumbnailDiagnostics.test.ts`
- Test: `tests/unit/AppLibraryWorkflow.test.tsx`

**Interfaces:**
- Produces: health code `metadata-file-relocation-unresolved`.
- Produces: diagnostic library context `{ rootPath, libraryId }` from the current session.

- [ ] **Step 1: Write failing health and diagnostics tests**

Prove a missing durable metadata record with an identity is labeled as an unresolved relocation, while one without an identity remains `metadata-file-missing`. Prove copied diagnostics report the current session root/ID after switching libraries, not the original settings value.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/unit/libraryHealth.test.ts tests/unit/thumbnailDiagnostics.test.ts tests/unit/AppLibraryWorkflow.test.tsx`

- [ ] **Step 3: Add localized recovery status**

Add Portuguese and English labels explaining that the file may have been renamed outside the app and that its saved data remains protected. Do not present automatic success for ambiguous matches.

- [ ] **Step 4: Report the actual active session in diagnostics**

Pass `activeLibrarySessionRef.current` into diagnostic formatting. Update the privacy text to state that copied diagnostics include the selected library location and ID, and keep model filenames/content excluded.

- [ ] **Step 5: Verify library switching persistence**

Extend the workflow test to activate library B, save settings only after activation succeeds, and assert failed activation restores library A without persisting B. No extra settings state is introduced.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- tests/unit/libraryHealth.test.ts tests/unit/thumbnailDiagnostics.test.ts tests/unit/AppLibraryWorkflow.test.tsx tests/unit/settingsMutationQueue.test.ts`

Expected: PASS.

Commit: `git commit -am "feat: surface protected relocation metadata"`

---

### Task 6: End-to-end verification and documentation

**Files:**
- Modify: `README.md`
- Create: `docs/verification-checklist.md`

**Interfaces:**
- Verifies all interfaces from Tasks 1-5.

- [ ] **Step 1: Add a manual safety scenario**

Document this acceptance flow:

```text
1. Add a tag, note, and favorite to a model.
2. Wait for library data to finish saving.
3. Rename the model in Windows Explorer.
4. Confirm the card reappears under the new name with all data.
5. Rename its parent folder in Windows Explorer and confirm again.
6. Copy the model to create identical content, rename both candidates, and confirm no automatic ambiguous migration occurs.
```

- [ ] **Step 2: Run the complete automated suite**

Run: `npm test`

Expected: all tests pass with no unhandled rejection or warning introduced by identity jobs.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite build successfully.

- [ ] **Step 4: Inspect the final diff and workspace**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended files and the pre-existing untracked `.superpowers/` remain.

- [ ] **Step 5: Commit verification docs**

Commit: `git add README.md docs/verification-checklist.md && git commit -m "docs: verify external rename recovery"`
