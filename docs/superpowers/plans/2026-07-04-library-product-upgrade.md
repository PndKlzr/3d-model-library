# Library Product Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the 3D model browser into a file-explorer-style print library with navigation, metadata, organization, intelligence, and safety features.

**Architecture:** Store user metadata separately from STL/3MF files in Electron app data. Keep filesystem operations in Electron services, expose explicit IPC methods, and keep the renderer focused on view state and interaction.

**Tech Stack:** Electron, React, TypeScript, Vitest, Node filesystem APIs.

---

### Task 1: Persistent Library Metadata

**Files:**
- Create: `electron/services/libraryMetadataStore.ts`
- Modify: `src/shared/types.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/preload.d.ts`
- Test: `tests/unit/libraryMetadataStore.test.ts`

- [ ] Add tests for reading empty metadata, toggling favorite, setting tags, setting notes, and recording opened slicer history.
- [ ] Implement metadata storage in Electron app data.
- [ ] Expose metadata get/save APIs through preload.

### Task 2: Navigation And Front-End Flow

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/FolderTree.tsx`
- Modify: `src/components/ModelGrid.tsx`
- Modify: `src/components/DetailsPanel.tsx`
- Modify: `src/styles.css`

- [ ] Add breadcrumb and back/forward folder history.
- [ ] Add grid/list view toggle.
- [ ] Add status bar with counts and selection.
- [ ] Add details tabs for info, preview/actions, and notes.
- [ ] Add context menu entries for favorite, tags, move, slicer actions, and show in Explorer.

### Task 3: Organization Tools

**Files:**
- Modify: `src/lib/folderFilters.ts`
- Modify: `src/App.tsx`
- Test: `tests/unit/folderFilters.test.ts`

- [ ] Add filtering by favorite and multiple tags.
- [ ] Add selected-files move action from context/menu.
- [ ] Keep drag-and-drop behavior unchanged.

### Task 4: Intelligence And Safety

**Files:**
- Create: `src/lib/duplicateModels.ts`
- Modify: `electron/services/fileOrganizer.ts`
- Modify: `electron/main.ts`
- Test: `tests/unit/duplicateModels.test.ts`
- Test: `tests/unit/fileOrganizer.test.ts`

- [ ] Detect duplicates by name and size.
- [ ] Add show-in-Explorer IPC action.
- [ ] Add recycle-bin delete service instead of permanent delete.
- [ ] Add last-operation log and undo-ready operation records.
