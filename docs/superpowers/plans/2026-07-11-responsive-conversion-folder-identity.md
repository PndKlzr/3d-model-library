# Responsive Conversion And Folder Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 3MF conversion off the renderer thread, expose progress, and strengthen folder-card identity.

**Architecture:** A module worker reuses the existing synchronous converter and posts stage progress. A Promise wrapper owns worker lifecycle and the details panel displays progress. Folder mosaics receive a persistent semantic strip and distinct border styling.

**Tech Stack:** React, TypeScript, Vite Web Workers, Three.js, Vitest, CSS Grid.

## Global Constraints

- Do not alter native drag behavior.
- Preserve conversion output and destination behavior.
- Do not add dependencies.

---

### Task 1: Worker Conversion With Progress

**Files:**
- Create: `src/workers/threeMfToStl.worker.ts`
- Create: `src/lib/threeMfToStlWorker.ts`
- Modify: `src/lib/threeMfToStl.ts`
- Modify: `src/App.tsx`
- Test: `tests/unit/threeMfToStl.test.ts`
- Test: `tests/unit/interactionFlowContract.test.ts`

- [ ] Write failing tests for progress stages and worker lifecycle.
- [ ] Run focused tests and confirm the missing behavior fails.
- [ ] Implement worker conversion, transfer the input buffer, forward progress, and terminate reliably.
- [ ] Run focused tests and confirm they pass.

### Task 2: Progress UI And Folder Identity

**Files:**
- Modify: `src/components/DetailsPanel.tsx`
- Modify: `src/components/FolderCardThumbnail.tsx`
- Modify: `src/styles.css`
- Test: `tests/unit/interactionFlowContract.test.ts`
- Test: `tests/unit/productFlowContract.test.ts`

- [ ] Write failing contracts for progressbar semantics and the persistent folder strip.
- [ ] Implement converting state, percentage display, folder strip, and theme styling.
- [ ] Run focused tests, full tests, and production build.

