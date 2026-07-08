# Front Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing desktop UI more resilient and polished without changing the three-panel library workflow.

**Architecture:** Keep the current React components and CSS file. Add one small shared `DialogShell` component for consistent modal behavior, improve `TagSelector` local popover behavior, and use CSS responsive rules for shell/list/tag density.

**Tech Stack:** React 18, TypeScript, CSS, Vitest contract tests, Electron.

---

### Task 1: Responsive Shell And List Contracts

**Files:**
- Modify: `tests/unit/layoutContract.test.ts`
- Modify: `tests/unit/productFlowContract.test.ts`

- [ ] **Step 1: Write failing layout tests**

Add assertions that `src/styles.css` contains:

```ts
expect(css).toContain("grid-template-columns: clamp(220px, 18vw, 260px) minmax(0, 1fr) clamp(300px, 24vw, 360px)");
expect(css).toContain("@media (max-width: 1100px)");
expect(css).toContain(".model-list-main .optional-column");
expect(css).toContain(".tag-filter-row");
expect(css).toContain("max-height: 72px");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- tests/unit/layoutContract.test.ts tests/unit/productFlowContract.test.ts`

- [ ] **Step 3: Implement CSS**

Update `src/styles.css` so the shell columns fit the current Electron minimum width, list optional columns can be hidden at narrower widths, and tag filter rows have a capped scrollable height.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd test -- tests/unit/layoutContract.test.ts tests/unit/productFlowContract.test.ts`

### Task 2: Tag Selector Behavior

**Files:**
- Modify: `tests/unit/interactionFlowContract.test.ts`
- Modify: `src/components/TagSelector.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing tag selector tests**

Add assertions that `TagSelector` uses a root ref, document pointer handling, Escape close handling, `aria-haspopup="listbox"`, and panel-safe popover sizing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- tests/unit/interactionFlowContract.test.ts`

- [ ] **Step 3: Implement tag selector**

Add outside-click and Escape closing, keep the current checkbox list behavior, and style the popover with safe local width/height.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd test -- tests/unit/interactionFlowContract.test.ts`

### Task 3: Shared Dialog Shell

**Files:**
- Create: `src/components/DialogShell.tsx`
- Modify: `src/components/ConfirmDialog.tsx`
- Modify: `src/components/TextInputDialog.tsx`
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/unit/interactionFlowContract.test.ts`

- [ ] **Step 1: Write failing dialog tests**

Add assertions that dialogs import/use `DialogShell`, the shell exposes `dialog-backdrop`, and `App.tsx` closes overlays through the existing Escape/mouse-back path.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- tests/unit/interactionFlowContract.test.ts`

- [ ] **Step 3: Implement DialogShell**

Create a shared wrapper that focuses the dialog on mount, supports backdrop click cancel, labels the dialog, and preserves existing markup/classes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd test -- tests/unit/interactionFlowContract.test.ts`

### Task 4: Final Verification

**Files:**
- All modified files

- [ ] **Step 1: Run full tests**

Run: `npm.cmd test`

- [ ] **Step 2: Run production build**

Run: `npm.cmd run build`

- [ ] **Step 3: Check diff hygiene**

Run: `git diff --check`

- [ ] **Step 4: Commit**

```powershell
git add src tests docs electron
git commit -m "style: polish responsive front flows"
```
