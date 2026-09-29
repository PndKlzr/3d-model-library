# Security and Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Electron application and archive/file boundaries, add an accurate filtered-result count, and update security-sensitive dependencies without regressing native drag-out.

**Architecture:** Keep privileged operations in Electron and add small pure validation helpers around window navigation, canonical library files, and archive limits. Renderer changes consume an explicit scope count from `App` rather than recomputing filesystem state. Runtime and dependency upgrades land only after behavior changes are green so they can be reverted independently.

**Tech Stack:** Electron, TypeScript, React 18, Vite, Vitest, fflate, fast-xml-parser.

**Spec:** `docs/superpowers/specs/2026-09-16-security-release-readiness-design.md`

## Global Constraints

- Preserve native `webContents.startDrag` behavior and its synchronous IPC gesture.
- Do not update React, React Three Fiber, Drei, Three.js, or unrelated major UI dependencies.
- Do not use `npm audit fix --force`.
- Do not change model files, portable metadata, library index, or thumbnail cache formats.
- Land every task as an independently revertible commit.
- Use test-first development for every behavior change.

---

### Task 1: BrowserWindow Security Boundary

**Files:**
- Create: `electron/services/windowSecurity.ts`
- Modify: `electron/main.ts:961-1002`
- Modify: `index.html:3-10`
- Create: `tests/unit/windowSecurity.test.ts`
- Modify: `tests/unit/preloadContract.test.ts`

**Interfaces:**
- Produces: `configureWindowSecurity(webContents, allowedUrl): void`.
- Consumes: one exact allowed renderer URL, either `http://127.0.0.1:5173/` or the production renderer file URL.

- [ ] **Step 1: Write failing window-security tests**

Create a fake web-contents adapter that records `will-navigate` and `setWindowOpenHandler` handlers. Assert that the exact renderer URL is allowed, `https://example.com`, `file:///C:/Windows/System32/`, and lookalike localhost URLs are prevented, and every `window.open` returns `{ action: "deny" }`.

```ts
const contents = createFakeWebContents();
configureWindowSecurity(contents, "http://127.0.0.1:5173/");
expect(contents.navigate("http://127.0.0.1:5173/models")).toBe(false);
expect(contents.navigate("https://example.com/")).toBe(true);
expect(contents.open("https://example.com/")).toEqual({ action: "deny" });
```

Extend the contract test to require `sandbox: true`, `navigateOnDragDrop: false`, and a Content Security Policy.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --run tests/unit/windowSecurity.test.ts tests/unit/preloadContract.test.ts`

Expected: FAIL because the helper, explicit sandbox options, and CSP do not exist.

- [ ] **Step 3: Implement the minimal security adapter**

Use a narrow structural interface instead of importing a real BrowserWindow in tests:

```ts
type SecuredWebContents = {
  on(event: "will-navigate", listener: (event: { preventDefault(): void }, url: string) => void): void;
  setWindowOpenHandler(handler: () => { action: "deny" }): void;
};

export function configureWindowSecurity(contents: SecuredWebContents, allowedUrl: string) {
  const allowed = new URL(allowedUrl);
  contents.on("will-navigate", (event, candidate) => {
    const target = new URL(candidate);
    const sameRenderer = target.protocol === allowed.protocol &&
      target.host === allowed.host &&
      (allowed.protocol !== "file:" || target.pathname === allowed.pathname);
    if (!sameRenderer) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
}
```

Set `sandbox: true` and `navigateOnDragDrop: false`. Configure the helper before `loadURL`/`loadFile`. Add a CSP allowing self scripts, inline styles, data/blob images, blob workers, and localhost Vite/WebSocket connections, while denying objects, frames, and base changes.

- [ ] **Step 4: Verify GREEN and build**

Run: `npm test -- --run tests/unit/windowSecurity.test.ts tests/unit/preloadContract.test.ts tests/unit/nativeFileDragHelper.test.ts && npm run build`

Expected: all focused tests pass and production build succeeds.

- [ ] **Step 5: Commit**

```powershell
git add electron/services/windowSecurity.ts electron/main.ts index.html tests/unit/windowSecurity.test.ts tests/unit/preloadContract.test.ts
git commit -m "Harden renderer navigation boundaries"
```

---

### Task 2: Canonical Library File Reads

**Files:**
- Create: `electron/services/libraryFileAccess.ts`
- Modify: `electron/main.ts:377-454,563-568`
- Create: `tests/unit/libraryFileAccess.test.ts`
- Modify: `tests/unit/interactionFlowContract.test.ts`

**Interfaces:**
- Produces: `resolveCanonicalLibraryFile(rootPath: string, candidatePath: string, adapters?): Promise<string>`.
- Guarantees: returned path is an existing regular file whose canonical path is strictly inside the canonical root.

- [ ] **Step 1: Write failing canonical-path tests**

Cover a regular file, missing file, directory, lexical outside path, and a symlink/junction inside the root that points outside. Use filesystem adapters for a deterministic Windows junction case if symlink creation is unavailable.

```ts
await expect(resolveCanonicalLibraryFile(root, insideFile)).resolves.toBe(await realpath(insideFile));
await expect(resolveCanonicalLibraryFile(root, junctionFile)).rejects.toThrow("fora da biblioteca");
await expect(resolveCanonicalLibraryFile(root, root)).rejects.toThrow("arquivo regular");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run tests/unit/libraryFileAccess.test.ts`

Expected: FAIL because `resolveCanonicalLibraryFile` does not exist.

- [ ] **Step 3: Implement and route privileged reads through it**

Canonicalize root and candidate with `realpath`, reject null bytes and non-absolute candidates, check `isPathInside(canonicalRoot, canonicalCandidate)`, and require `stat(...).isFile()`.

Use the canonical path before `readModelMetadata`, `readEmbeddedThumbnail`, `readFile`, `shell.showItemInFolder`, and direct hash inputs. Keep metadata keys and destination-creation flows unchanged.

- [ ] **Step 4: Verify focused and filesystem suites**

Run: `npm test -- --run tests/unit/libraryFileAccess.test.ts tests/unit/libraryImage.test.ts tests/unit/libraryObj.test.ts tests/unit/fileOrganizer.test.ts tests/unit/fileDrag.test.ts tests/unit/interactionFlowContract.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add electron/services/libraryFileAccess.ts electron/main.ts tests/unit/libraryFileAccess.test.ts tests/unit/interactionFlowContract.test.ts
git commit -m "Canonicalize privileged library reads"
```

---

### Task 3: Bounded Archive Handling

**Files:**
- Create: `electron/services/archiveSafety.ts`
- Modify: `electron/services/archiveManager.ts`
- Modify: `tests/unit/archiveManager.test.ts`
- Create: `tests/unit/archiveSafety.test.ts`

**Interfaces:**
- Produces: `validateArchiveEntries(entries, limits): void`.
- Produces: `resolveSevenZipExecutable(configuredPath?, adapters?): Promise<string>` as an exported validated resolver.
- Limits: built-in ZIP input 256 MiB, 10,000 entries, 256 MiB per entry, 512 MiB total expanded bytes; 7-Zip extraction 20,000 entries, 8 GiB per entry, 16 GiB total.

- [ ] **Step 1: Write failing archive-limit tests**

Test entry-count, individual-size, total-size, negative/non-finite sizes, and valid model archives. Test configured extractor rejection for directories, symlinks, non-absolute paths, and executable names outside `7z.exe`, `7zz.exe`, and `7za.exe`.

```ts
expect(() => validateArchiveEntries([{ path: "huge.stl", sizeBytes: BUILTIN_LIMITS.maxEntryBytes + 1 }], BUILTIN_LIMITS))
  .toThrow("grande demais");
await expect(resolveSevenZipExecutable(fakeExe)).rejects.toThrow("7-Zip");
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run tests/unit/archiveSafety.test.ts tests/unit/archiveManager.test.ts`

Expected: new tests fail because limits and strict extractor resolution are absent.

- [ ] **Step 3: Implement entry validation and extractor canonicalization**

Add immutable limit objects and sum sizes using safe integers. Resolve configured extractors with `lstat`, reject links, canonicalize with `realpath`, require a regular `.exe`, and require an accepted basename case-insensitively.

Validate 7-Zip listing output before extraction. Reject oversized built-in ZIP files using `stat` before reading.

- [ ] **Step 4: Replace synchronous unbounded ZIP inflation**

Wrap `fflate.unzip` in a Promise and use its `filter` callback to count entries and validate `originalSize` before each entry is inflated. Only include selected paths during extraction. Abort with the localized safe-limit error once any bound is crossed; do not write partial files because destination writes begin only after bounded decompression succeeds.

```ts
const files = await unzipBounded(bytes, {
  limits: BUILTIN_LIMITS,
  selectedPaths
});
```

- [ ] **Step 5: Verify archive suite and build**

Run: `npm test -- --run tests/unit/archiveSafety.test.ts tests/unit/archiveManager.test.ts && npm run build`

Expected: archive tests pass, traversal/duplicate tests remain green, and build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add electron/services/archiveSafety.ts electron/services/archiveManager.ts tests/unit/archiveSafety.test.ts tests/unit/archiveManager.test.ts
git commit -m "Bound archive extraction resources"
```

---

### Task 4: Filtered Result Count

**Files:**
- Modify: `src/lib/folderFilters.ts`
- Modify: `src/App.tsx:1990-2050,2118`
- Modify: `src/components/ModelGrid.tsx:57-128,497-520`
- Modify: `src/i18n/catalog.ts`
- Modify: `src/styles.css`
- Modify: `tests/unit/folderFilters.test.ts`
- Modify: `tests/unit/ModelGridFilters.test.tsx`
- Modify: `tests/unit/i18n.test.ts`
- Modify: `tests/unit/layoutContract.test.ts`

**Interfaces:**
- Produces: `getFolderScopeModels(models, selectedFolder, includeSubfolders): ModelFile[]`.
- Adds ModelGrid prop: `scopeModelCount: number`.

- [ ] **Step 1: Write failing scope and UI tests**

Assert root/all, one folder with descendants, and one exact folder scope. Render ModelGrid with `scopeModelCount={12}` and three filtered models; expect `3 de 12 modelos`. With no active filters and 12 models, expect `12 modelos`. Repeat translation assertions for English.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --run tests/unit/folderFilters.test.ts tests/unit/ModelGridFilters.test.tsx tests/unit/i18n.test.ts tests/unit/layoutContract.test.ts`

Expected: FAIL because scope helper, prop, and translation keys are absent.

- [ ] **Step 3: Implement folder scope once and reuse it**

Extract the existing folder-membership predicate from `filterModels` into `getFolderScopeModels`. In App, memoize `scopeModels`, keep the existing `filteredModels` calculation unchanged, and pass `scopeModels.length` to ModelGrid. This avoids changing filter semantics while giving the denominator a single tested source.

Add localized plural keys for `{count} modelo(s)` and filtered `{visible} de {total} modelo(s)`. Render a compact `result-count` in `toolbar-statuses`; use `hasActiveFilters` to choose the text. Keep it `white-space: nowrap` and let the parent toolbar wrap at intermediate widths.

- [ ] **Step 4: Verify focused tests and localized smoke tests**

Run: `npm test -- --run tests/unit/folderFilters.test.ts tests/unit/ModelGridFilters.test.tsx tests/unit/i18n.test.ts tests/unit/localizedRendererSmoke.test.tsx tests/unit/layoutContract.test.ts`

Expected: all focused tests pass in Portuguese and English.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/folderFilters.ts src/App.tsx src/components/ModelGrid.tsx src/i18n/catalog.ts src/styles.css tests/unit/folderFilters.test.ts tests/unit/ModelGridFilters.test.tsx tests/unit/i18n.test.ts tests/unit/layoutContract.test.ts
git commit -m "Show filtered model result counts"
```

---

### Task 5: Electron Runtime Upgrade

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/unit/preloadContract.test.ts` only if Electron 44 requires an intentional preload contract adjustment.
- Modify: `docs/performance/thumbnail-benchmark-baseline.md` only if measured runtime values are recorded again.

**Interfaces:**
- Preserves: preload API, `webContents.startDrag({ file, files, icon })`, app data paths, and renderer behavior.

- [ ] **Step 1: Record the pre-upgrade contract**

Run: `npm test -- --run tests/unit/preloadContract.test.ts tests/unit/fileDrag.test.ts tests/unit/nativeFileDragHelper.test.ts tests/unit/nativeDropProbeContract.test.ts`

Expected: all pass on Electron 33.2.1.

- [ ] **Step 2: Upgrade Electron only**

Run: `npm install --save-dev electron@44.4.1`

Confirm `package.json` and lockfile contain Electron 44.4.1 and no unrelated direct dependency changed.

- [ ] **Step 3: Run complete automated verification**

Run: `npm test -- --run && npm run build`

Expected: the full suite and production build pass. If not, fix only Electron compatibility issues or revert this task.

- [ ] **Step 4: Commit the isolated runtime upgrade**

```powershell
git add package.json package-lock.json
git commit -m "Upgrade Electron runtime to 44.4.1"
```

- [ ] **Step 5: Manual native-drag acceptance gate**

Ask the user to drag one STL and one 3MF into Cura, then into Creality Print. Also drag one file to Explorer/Desktop and perform one internal folder move. Do not proceed if any gesture regresses; revert only the Electron commit if necessary.

---

### Task 6: Targeted Dependency Remediation and Final Audit

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: XML parser call sites only if the v5 API requires it: `electron/services/modelMetadata.ts`, `src/lib/threeMfPreview.ts`
- Modify: relevant tests under `tests/unit/modelMetadata.test.ts` and `tests/unit/threeMfPreview.test.ts`
- Create: `docs/security/release-readiness-2026-09-16.md`

**Interfaces:**
- Preserves: parsed 3MF metadata and preview geometry.

- [ ] **Step 1: Remove unused development packages**

Verify `concurrently` and `wait-on` have no runtime/script references, then run:

```powershell
npm uninstall --save-dev concurrently wait-on
```

- [ ] **Step 2: Write/confirm XML parser regression tests before upgrade**

Ensure tests cover namespaced 3MF XML, malformed XML rejection/fallback, object lists, and existing preview fixture behavior. Run them once on v4 and record green output.

- [ ] **Step 3: Upgrade the direct XML parser**

Run: `npm install fast-xml-parser@5.11.1`

Adapt only constructor/options differences required by the existing tests.

- [ ] **Step 4: Apply compatible non-major patches**

Run `npm update` only after reviewing the dry-run diff. Keep React/Three packages unchanged. Do not override the nested `fflate@0.6.10` unless its parent can be safely updated without a Drei/Three major upgrade; document it as a non-reachable residual advisory if it remains.

- [ ] **Step 5: Run final security and behavior verification**

Run:

```powershell
npm audit --omit=dev
npm audit
npm test -- --run
npm run build
git diff --check
```

Document remaining advisories by package, reachability, and reason for deferral. Confirm again that tracked files contain no personal paths, credentials, build output, executables, or library content.

- [ ] **Step 6: Commit remediation and report**

```powershell
git add package.json package-lock.json electron/services/modelMetadata.ts src/lib/threeMfPreview.ts tests/unit/modelMetadata.test.ts tests/unit/threeMfPreview.test.ts docs/security/release-readiness-2026-09-16.md
git commit -m "Remediate release dependency risks"
```

---

### Task 7: Final Release-Readiness Checkpoint

**Files:**
- Modify: `README.md` only if runtime/setup instructions changed.
- Modify: `docs/security/release-readiness-2026-09-16.md`

**Interfaces:**
- Produces: one auditable checklist for the future installer task.

- [ ] **Step 1: Verify repository state**

Run `git status --short`, confirm only the unrelated untracked `.superpowers/` directory remains, and never add it.

- [ ] **Step 2: Run one fresh complete verification**

Run: `npm test -- --run && npm run build && git diff --check`

Expected: zero test failures, successful production build, and no whitespace errors.

- [ ] **Step 3: Record manual acceptance**

Record the user's Cura, Creality Print, Explorer/Desktop, and internal-folder drag results in the security report. Record whether Kaspersky retained the upgraded Electron executable.

- [ ] **Step 4: Commit documentation if changed**

```powershell
git add README.md docs/security/release-readiness-2026-09-16.md
git commit -m "Record release readiness verification"
```
