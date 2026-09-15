# Thumbnail Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move cold STL, 3MF, and OBJ thumbnail rendering off the library UI thread while preserving a working main-thread fallback.

**Architecture:** A persistent module Worker owns one OffscreenCanvas/WebGL renderer. A testable client mediates startup and per-job outcomes. The existing service and cache pipeline stay unchanged except for choosing Worker output in the render stage.

**Tech Stack:** Electron 33.2.1, Chromium 130, Three.js 0.171, Vite 6, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-thumbnail-worker-design.md`

## Global Constraints

- Keep one render job at a time and leave the existing disk cache signature unchanged.
- Keep original bytes until a job settles so transport failure can use the current renderer.
- Do not use the main renderer for model parse failures or timeouts.
- Do not modify model files, portable metadata, drag behavior, or the right-side viewer.
- Do not report filenames, paths, or model bytes in diagnostics.

---

### Task 1: Testable Worker Client

**Files:** Create `src/lib/thumbnailWorkerClient.ts`; create `tests/unit/thumbnailWorkerClient.test.ts`.

**Interfaces:** Produce `createThumbnailWorkerClient(factory): { render(extension, bytes): Promise<string | null> }`, where `null` means Worker unavailable and a rejected Promise means a model/render failure.

- [x] Write tests using a fake Worker: ready/success, startup failure, per-model error, transport crash, and timeout.
- [x] Run `npx vitest run tests/unit/thumbnailWorkerClient.test.ts` and confirm red due to missing client.
- [x] Implement one persistent Worker with request IDs, startup and job timers, and disabled fallback state.
- [x] Re-run focused tests; commit with the completed integration.

### Task 2: Offscreen Renderer And Service Integration

**Files:** Create `src/workers/thumbnail.worker.ts`; modify `src/lib/thumbnailRenderer.ts`, `src/lib/modelThumbnailService.ts`, and `tests/unit/modelThumbnailService.test.ts`.

**Interfaces:** Worker accepts `{ id, extension, bytes }`; returns `{ type: "result", id, mime, bytes }` or `{ type: "error", id, message }`. The service dependency `renderThumbnailInWorker(extension, bytes)` returns an image data URL or `null` for fallback.

- [x] Add service tests proving Worker success bypasses main rendering and unavailable Worker uses the current renderer.
- [x] Run focused tests red, then extract the current scene-rendering code for reuse by the OffscreenCanvas Worker.
- [x] Render to WebP with PNG fallback and return bytes via transfer, retaining source bytes in the renderer.
- [x] Re-run focused tests and production build; commit integration.

### Task 3: Real Models And Regression

**Files:** Create an isolated development smoke runner under `tools/`; use existing benchmark command and `tests/unit/performanceContract.test.ts` as needed.

- [x] Run the Worker against read-only STL, 3MF, and OBJ samples from the user's Teste library, including a multi-object 3MF.
- [ ] Compare main-thread long tasks in a cold-library user run; isolated smoke confirms nonblank images but does not establish a full-library performance result.
- [x] Run `npm test`, `npm run build`, and `git diff --check`; commit only when results are confirmed.
