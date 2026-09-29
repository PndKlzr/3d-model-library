# Windows FDM Slicer Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect supported Windows FDM slicers safely, let the user choose the default, and support fully editable custom slicer integrations.

**Architecture:** A pure catalog and candidate-merging layer sits above a Windows-only discovery adapter. Electron performs bounded registry, shortcut, association, and known-directory checks; the renderer receives validated results and persists integrations through normalized settings.

**Tech Stack:** TypeScript, Electron IPC, Windows `reg.exe`, bounded PowerShell shortcut resolution, Node filesystem APIs, React, Vitest

**Spec:** `docs/superpowers/specs/2026-09-14-responsive-i18n-slicer-integrations-design.md`

## Global Constraints

- Detect only FDM slicers in this phase.
- Detection is read-only, bounded, and never launches an executable or recursively scans a drive.
- No slicer becomes default automatically.
- Persisted or launched executables must canonicalize to existing regular `.exe` files.
- Existing Cura/Creality settings and slicer history must survive migration.

---

### Task 1: Slicer Catalog and Settings Migration

**Files:**
- Create: `src/shared/slicerCatalog.ts`
- Modify: `src/shared/types.ts`
- Modify: `electron/services/settingsStore.ts`
- Modify: `src/lib/settingsMutations.ts`
- Test: `tests/unit/slicerCatalog.test.ts`
- Test: `tests/unit/settingsStore.test.ts`
- Test: `tests/unit/settingsMutationQueue.test.ts`

**Interfaces:**
- Produces: `type BuiltInSlicerKey = "cura" | "creality-print" | "orca-slicer" | "prusa-slicer" | "bambu-studio" | "anycubic-slicer-next" | "ideamaker" | "elegoo-satellite"`.
- Extends: `SlicerConfig` with `kind: "built-in" | "custom"`, optional `builtInKey`, and `pathSource: "detected" | "manual" | null`.
- Produces mutations: `addCustomSlicer`, `renameCustomSlicer`, `removeCustomSlicer`, `setSlicerExecutable`, `setSlicerEnabled`, `setDefaultSlicer`.

- [ ] **Step 1: Write failing tests for all eight catalog entries, stable IDs, migration of legacy Cura/Creality objects, unique custom IDs, rename stability, and clearing the default when a custom integration is removed.**

- [ ] **Step 2: Run focused tests and verify new fields/mutations are missing.**

- [ ] **Step 3: Implement the catalog and normalize legacy settings without replacing existing paths, enabled flags, IDs, default selection, or history references. Add absent built-ins in disabled/unconfigured state.**

- [ ] **Step 4: Implement custom mutations with IDs from `crypto.randomUUID()`. `setSlicerExecutable` must no longer choose a default implicitly; only `setDefaultSlicer` may do so.**

- [ ] **Step 5: Run focused tests and commit with `git commit -m "feat: expand slicer integration settings"`.**

### Task 2: Pure Discovery and Candidate Merge

**Files:**
- Create: `electron/services/slicerDiscovery.ts`
- Create: `tests/unit/slicerDiscovery.test.ts`

**Interfaces:**
- Produces: `SlicerCandidate { builtInKey, executablePath, version?, evidence }`.
- Produces: `parseRegistrySlicerCandidates(output, catalog): SlicerCandidate[]`.
- Produces: `mergeSlicerCandidates(candidates): SlicerCandidate[]`.
- Produces: `discoverWindowsSlicers(options): Promise<SlicerCandidate[]>` with injected command/filesystem adapters for tests.

- [ ] **Step 1: Write fixture-driven failing tests for HKLM/HKCU uninstall records, App Paths, quoted `DisplayIcon` values, file-association commands, versioned install folders, duplicate paths, malformed records, and non-`.exe` candidates.**

- [ ] **Step 2: Run `npm test -- tests/unit/slicerDiscovery.test.ts --reporter=dot` and verify the service is missing.**

- [ ] **Step 3: Implement case-insensitive catalog aliases and parsers. Canonicalize existing candidates, reject directories/non-executables, and deduplicate by lowercase real path. Prefer stronger evidence in this order: App Paths, uninstall record, association, Start Menu, known directory.**

- [ ] **Step 4: Add bounded probes for registry roots and known product directories. Resolve only matching Start Menu `.lnk` files in one hidden PowerShell process with a fixed script; pass paths as encoded input rather than interpolated commands.**

- [ ] **Step 5: Run focused security/path tests and commit with `git commit -m "feat: detect installed Windows slicers"`.**

### Task 3: Validated IPC and Launch Boundary

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/preload.d.ts`
- Modify: `electron/services/slicerLauncher.ts`
- Create: `electron/services/slicerExecutable.ts`
- Test: `tests/unit/preloadContract.test.ts`
- Test: `tests/unit/slicerExecutable.test.ts`
- Test: `tests/unit/slicerLauncher.test.ts`

**Interfaces:**
- Adds: `detectSlicers(): Promise<SlicerCandidate[]>` to preload.
- Produces: `resolveSlicerExecutable(candidatePath): Promise<string>`.
- Keeps: `launchSlicer(slicer, modelPaths)` but requires the resolved validated path.

- [ ] **Step 1: Write failing tests rejecting relative paths, missing files, directories, non-`.exe` files, symlinks escaping the selected path, and stale configured executables. Test that discovery never calls the launch adapter.**

- [ ] **Step 2: Run focused tests and verify validation/IPC is absent.**

- [ ] **Step 3: Register `slicer:detect`, expose it through preload, and return only serializable candidate data. Validate manual selections before saving and validate again immediately before launch.**

- [ ] **Step 4: Return an unavailable status instead of deleting a stale integration. Keep STL/3MF capability filtering and multi-file launch behavior unchanged.**

- [ ] **Step 5: Run focused tests and commit with `git commit -m "fix: validate slicer discovery and launches"`.**

### Task 4: Integration Settings UI

**Files:**
- Create: `src/components/SlicerIntegrationList.tsx`
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/unit/SlicerIntegrationList.test.tsx`
- Test: `tests/unit/productFlowContract.test.ts`

**Interfaces:**
- Produces: `SlicerIntegrationList` callbacks for detect, enable, default, choose executable, add, rename, and remove.
- Consumes: localized strings from the completed localization plan.

- [ ] **Step 1: Write failing UI tests for detected/missing/manual states, explicit default selection, rescan, custom add/rename/remove, disabled launch state, and confirmation before removing a custom slicer.**

- [ ] **Step 2: Run focused tests and verify the new integration UI is missing.**

- [ ] **Step 3: Replace the dense five-column slicer rows with responsive rows: identity/status first, default and enabled controls second, overflow menu for edit/repair/remove. Use icons and tooltips for compact actions.**

- [ ] **Step 4: Add `Detectar novamente` and `Adicionar programa`. Detection merges found paths without changing `defaultSlicerId`; custom creation requests a name, then a `.exe`, and persists only after both succeed.**

- [ ] **Step 5: Verify narrow/dark/English layouts, run `npm test -- --reporter=dot`, `npm run build`, and `git diff --check`; commit with `git commit -m "feat: add slicer discovery management UI"`.**

