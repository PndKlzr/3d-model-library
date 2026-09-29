# Responsive Desktop UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing three-pane desktop UI usable from 760px-wide windows through wide desktop layouts without clipped dialogs, overlapping labels, or inaccessible controls.

**Architecture:** Keep the wide layout unchanged. Add explicit folder/details drawer state in `App`, expose compact panel controls in the sticky library header, and centralize dialog headers so every modal has the same close behavior and geometry.

**Tech Stack:** React 18, TypeScript, CSS Grid/Flexbox, Lucide icons, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-14-responsive-i18n-slicer-integrations-design.md`

## Global Constraints

- Preserve the current visual identity and existing desktop workflows.
- Wide windows keep all three columns; medium windows use a details drawer; narrow windows use folder and details drawers.
- The supported minimum window size is 760x560.
- Do not add a UI framework or browser automation dependency.
- Light and dark themes must share identical layout behavior.

---

### Task 1: Shared Dialog Header

**Files:**
- Create: `src/components/DialogHeader.tsx`
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/components/TextInputDialog.tsx`
- Modify: `src/components/ConfirmDialog.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/unit/DialogHeader.test.tsx`
- Test: `tests/unit/layoutContract.test.ts`

**Interfaces:**
- Produces: `DialogHeader({ eyebrow?, title, onClose }: DialogHeaderProps)`.
- Consumes: the existing `DialogShell` cancellation callback.

- [ ] **Step 1: Write the failing shared-header test**

```tsx
render(<DialogHeader eyebrow="Tags" title="Long model name.stl" onClose={onClose} />);
fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
expect(onClose).toHaveBeenCalledOnce();
expect(screen.getByRole("heading")).toHaveAttribute("title", "Long model name.stl");
```

- [ ] **Step 2: Run `npm test -- tests/unit/DialogHeader.test.tsx tests/unit/layoutContract.test.ts --reporter=dot` and verify the missing component/CSS contract fails.**

- [ ] **Step 3: Implement `DialogHeader` with a 36x36 `X` icon button, ellipsized title, tooltip, accessible label, and no dialog-specific close markup. Replace the four duplicated headers.**

- [ ] **Step 4: Add shared `.dialog-header`, `.dialog-header-copy`, and `.dialog-close` rules with `min-width: 0`, stable dimensions, and visible focus styling.**

- [ ] **Step 5: Re-run the focused tests and commit with `git commit -m "refactor: unify dialog headers"`.**

### Task 2: Responsive Panel State

**Files:**
- Create: `src/lib/responsivePanels.ts`
- Create: `src/components/ResponsivePanelControls.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/ModelGrid.tsx`
- Modify: `src/styles.css`
- Modify: `electron/main.ts`
- Test: `tests/unit/responsivePanels.test.ts`
- Test: `tests/unit/ModelGridFilters.test.tsx`

**Interfaces:**
- Produces: `type ResponsivePanel = "folders" | "details" | null`.
- Produces: `toggleResponsivePanel(current, requested): ResponsivePanel`.
- Produces: `ResponsivePanelControls({ openPanel, onToggleFolders, onToggleDetails })`.

- [ ] **Step 1: Write failing tests proving repeated clicks close a drawer and opening one drawer closes the other.**

```ts
expect(toggleResponsivePanel(null, "folders")).toBe("folders");
expect(toggleResponsivePanel("folders", "folders")).toBeNull();
expect(toggleResponsivePanel("folders", "details")).toBe("details");
```

- [ ] **Step 2: Run the focused tests and verify `toggleResponsivePanel` is missing.**

- [ ] **Step 3: Add `responsivePanel` state to `LibraryApp`, close it on Escape/backdrop/navigation, and render a shared scrim. Add folder/details icon controls to the sticky toolbar with `aria-expanded`.**

- [ ] **Step 4: Add app-shell data attributes and CSS breakpoints: wide at 1180px+, medium at 900-1179px, narrow at 760-899px. Medium overlays details; narrow overlays either side panel; drawers use fixed inset bounds and internal scrolling.**

- [ ] **Step 5: Lower the Electron `BrowserWindow` minimum to 760x560 and verify side panels never remain above dialogs by checking their z-index contract.**

- [ ] **Step 6: Run focused tests and commit with `git commit -m "feat: add responsive panel drawers"`.**

### Task 3: Stable Header Reflow

**Files:**
- Modify: `src/components/ModelGrid.tsx`
- Modify: `src/components/ThumbnailQueueStatus.tsx`
- Modify: `src/styles.css`
- Test: `tests/unit/layoutContract.test.ts`
- Test: `tests/unit/thumbnailQueueStatus.test.tsx`

**Interfaces:**
- Consumes: existing toolbar controls and responsive panel controls.
- Produces: one sticky header with semantic `.library-heading`, `.toolbar-statuses`, `.toolbar-actions`, `.search-box`, and `.filter-bar` rows.

- [ ] **Step 1: Add failing layout assertions for `min-width: 0`, explicit toolbar row wrapping, non-scaling heading text, square icon controls, and overflow-safe labels.**

- [ ] **Step 2: Run the focused tests and verify the new layout contracts fail.**

- [ ] **Step 3: Group title/status and action controls into stable regions. Keep `Sua biblioteca visual` at a fixed font size and let only low-priority helper copy disappear at narrower breakpoints.**

- [ ] **Step 4: Replace conflicting media rules with the three breakpoints from Task 2. Ensure search and filters occupy complete rows when necessary and never overlap toolbar actions.**

- [ ] **Step 5: Test both themes using long labels in the component fixtures, run `npm run build`, and commit with `git commit -m "fix: stabilize responsive library header"`.**

### Task 4: Viewport-Safe Dialogs and Popovers

**Files:**
- Modify: `src/components/DialogShell.tsx`
- Modify: `src/components/TagSelector.tsx`
- Modify: `src/components/FileTypeFilter.tsx`
- Modify: `src/styles.css`
- Test: `tests/unit/DialogShell.test.tsx`
- Test: `tests/unit/FileTypeFilter.test.tsx`
- Test: `tests/unit/contextMenuPosition.test.ts`

**Interfaces:**
- Produces: dialog geometry constrained by `max-width: calc(100vw - 24px)` and `max-height: calc(100dvh - 24px)`.
- Consumes: existing context-menu positioning helper.

- [ ] **Step 1: Write failing tests for Escape cancellation, backdrop cancellation, retained focus, and popovers carrying viewport-safe classes.**

- [ ] **Step 2: Run the focused tests and verify the missing cancellation/geometry behavior fails.**

- [ ] **Step 3: Keep the shell fixed in the viewport, move overflow to dialog content, and make the tag selector popover choose an upward placement when its trigger is near the bottom edge.**

- [ ] **Step 4: Ensure the tag dialog close button uses `DialogHeader`, does not shrink, and remains visible while its contents scroll.**

- [ ] **Step 5: Run `npm test -- --reporter=dot`, `npm run build`, and `git diff --check`; commit with `git commit -m "fix: keep dialogs and popovers inside viewport"`.**

