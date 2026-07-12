# Folder Thumbnail Mosaic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display up to four lazy-loaded model thumbnails inside each folder card.

**Architecture:** Folder-card data selects a deterministic, capped preview list. A dedicated React component observes the card, reuses the shared model thumbnail loader and cache, and renders a responsive mosaic with a folder-icon fallback.

**Tech Stack:** React, TypeScript, CSS Grid, Vitest, Electron renderer thumbnail APIs.

## Global Constraints

- Preserve the existing external and internal drag behavior.
- Request at most four STL or 3MF previews per visible folder.
- Reuse the existing thumbnail queue and cache.
- Keep list view unchanged.

---

### Task 1: Select Folder Preview Models

**Files:**
- Modify: `src/lib/gridFolders.ts`
- Test: `tests/unit/gridFolders.test.ts`

**Interfaces:**
- Produces: `GridFolderCard.previewModels: ModelFile[]`

- [ ] **Step 1: Write failing unit tests**

Assert that direct models precede descendants, archive files are excluded, and output is capped at four.

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run tests/unit/gridFolders.test.ts`
Expected: FAIL because `previewModels` does not exist.

- [ ] **Step 3: Implement selection**

Filter to `.stl` and `.3mf`, partition direct and descendant models, preserve deterministic source ordering, and return the first four.

- [ ] **Step 4: Verify task**

Run: `npm test -- --run tests/unit/gridFolders.test.ts`
Expected: PASS.

### Task 2: Render Lazy Folder Mosaics

**Files:**
- Create: `src/components/FolderCardThumbnail.tsx`
- Modify: `src/components/ModelCardThumbnail.tsx`
- Modify: `src/components/ModelGrid.tsx`
- Modify: `src/styles.css`
- Test: `tests/unit/productFlowContract.test.ts`

**Interfaces:**
- Consumes: `GridFolderCard.previewModels`
- Produces: `FolderCardThumbnail({ models }: { models: ModelFile[] })`
- Produces: `loadModelThumbnail(model: ModelFile): Promise<string | null>`

- [ ] **Step 1: Write failing component contract test**

Assert that folder cards use `FolderCardThumbnail`, the component uses `IntersectionObserver` and the shared loader, and its images set `draggable={false}`.

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run tests/unit/productFlowContract.test.ts`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement component and styles**

Export the existing loader, observe once with a 240px root margin, resolve four previews, omit failures, and render one/two/three/four-image CSS Grid layouts with a folder badge and fallback.

- [ ] **Step 4: Verify complete feature**

Run: `npm test -- --run tests/unit/gridFolders.test.ts tests/unit/productFlowContract.test.ts`
Expected: PASS.

Run: `npm test -- --run`
Expected: all tests PASS.

Run: `npm run build`
Expected: production build succeeds.

