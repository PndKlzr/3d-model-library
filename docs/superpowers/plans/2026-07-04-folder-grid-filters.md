# Folder Grid And Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make folder navigation behave like a lightweight file explorer with collapsible sidebar folders, folder cards in the grid, filters, and Ctrl/Shift selection.

**Architecture:** Keep disk operations unchanged. Add small renderer helpers for folder-card projection, model filtering/sorting, and multi-select gestures, then wire those helpers into `App`, `FolderTree`, and `ModelGrid`.

**Tech Stack:** React, TypeScript, Vitest, Electron renderer APIs.

---

### Task 1: Testable Navigation Helpers

**Files:**
- Create: `src/lib/gridFolders.ts`
- Create: `src/lib/modelSelection.ts`
- Modify: `src/lib/folderFilters.ts`
- Test: `tests/unit/gridFolders.test.ts`
- Test: `tests/unit/modelSelection.test.ts`
- Modify: `tests/unit/folderFilters.test.ts`

- [ ] Write failing tests for direct child folder cards, model counts, Ctrl toggle selection, Shift range selection, type filtering, sorting, and only-selected filtering.
- [ ] Run the focused tests and confirm they fail because the helpers/options do not exist.
- [ ] Implement the helpers and filter options.
- [ ] Re-run focused tests and confirm they pass.

### Task 2: Renderer Wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/FolderTree.tsx`
- Modify: `src/components/ModelGrid.tsx`
- Modify: `src/styles.css`

- [ ] Add persistent expanded folder IDs in `App`.
- [ ] Add direct folder cards to the grid and allow opening/dropping on them.
- [ ] Add filters for model type, sort order, and only selected.
- [ ] Replace checkbox-only multi-selection with normal click, Ctrl-click, and Shift-click behavior while keeping checkboxes useful.
- [ ] Keep drag-to-folder behavior working for both sidebar folders and grid folder cards.

### Task 3: Verification

**Files:**
- No new files.

- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run build`.
- [ ] Restart Electron with `npm.cmd run electron:dev`.
- [ ] Commit the feature.
