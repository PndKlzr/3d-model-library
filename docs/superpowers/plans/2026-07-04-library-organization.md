# Library Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe folder/file organization to the desktop model library.

**Architecture:** File operations live in a focused Electron service that validates paths against the configured library root before touching disk. The renderer adds multi-selection, drag-and-drop to existing folders, and explicit create/rename actions, then rescans the library after successful changes.

**Tech Stack:** Electron IPC, Node `fs/promises`, React, TypeScript, Vitest.

---

### Task 1: Safe File Operations

**Files:**
- Create: `electron/services/fileOrganizer.ts`
- Test: `tests/unit/fileOrganizer.test.ts`

- [ ] Write failing tests for creating folders, moving files without overwrite, rejecting paths outside the library, renaming folders, and renaming files while preserving `.stl` / `.3mf` extensions.
- [ ] Run `npm.cmd test -- tests/unit/fileOrganizer.test.ts` and confirm the service import fails or tests fail because functions do not exist.
- [ ] Implement `createLibraryFolder`, `moveModelFiles`, `renameLibraryFolder`, and `renameModelFile`.
- [ ] Re-run `npm.cmd test -- tests/unit/fileOrganizer.test.ts` and confirm all tests pass.

### Task 2: IPC Contract

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/preload.d.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/preloadContract.test.ts`

- [ ] Add IPC handlers for `library:create-folder`, `library:move-models`, `library:rename-folder`, and `library:rename-model-file`.
- [ ] Expose matching preload methods on `window.modelLibrary`.
- [ ] Add shared result/request types where useful.
- [ ] Update preload contract test to assert the new methods exist.

### Task 3: Renderer Organization UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/FolderTree.tsx`
- Modify: `src/components/ModelGrid.tsx`
- Modify: `src/components/DetailsPanel.tsx`
- Modify: `src/styles.css`

- [ ] Track multi-selected model IDs in `App`.
- [ ] Support Ctrl/Shift-free multi-select via checkbox-style selection on cards plus normal click for details.
- [ ] Make model cards draggable and drop targets on folder rows.
- [ ] Add sidebar buttons for creating a folder under the selected folder and renaming the selected folder.
- [ ] Add a details-panel action for renaming the selected file.
- [ ] Show operation feedback and rescan after success.

### Task 4: Verification

**Files:**
- No new files.

- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run build`.
- [ ] Restart Electron with `npm.cmd run electron:dev`.
- [ ] Commit all organization changes.
