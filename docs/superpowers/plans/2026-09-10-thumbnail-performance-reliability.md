# Thumbnail Performance and Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the library responsive while thumbnail work is coalesced, prioritized, measured, bounded in memory, reported clearly, and benchmarked without exposing or modifying library content.

**Architecture:** Replace the split cache/render flow with one renderer-side thumbnail service that coordinates a concurrent I/O scheduler and a single-job render scheduler. Both schedulers publish aggregate snapshots to a path-redacting metrics collector; React consumes only request handles and aggregate state. A development-only benchmark mode exercises the same service with an isolated cache profile and writes sanitized aggregate reports.

**Tech Stack:** Electron 33.2.1, React 18, TypeScript 5.7, Three.js 0.171, Vitest 2.1, Node.js 20+

**Spec:** `docs/superpowers/specs/2026-09-10-thumbnail-performance-reliability-design.md`

## Global Constraints

- Do not change internal drag, native external drag, selection, slicer launch, portable metadata, or filesystem organization behavior.
- Keep geometry render concurrency at exactly one until benchmark evidence supports a separate worker design.
- Diagnostics and benchmark reports contain aggregates and runtime versions only: no paths, filenames, tags, notes, images, or model bytes.
- Benchmark mode is read-only for the selected library and uses an isolated temporary Electron user-data directory.
- ZIP, RAR, and 7Z never enter thumbnail I/O or geometry-render queues.
- Persistent thumbnails remain in Electron's disk cache; renderer memory must have explicit entry and time bounds.
- Use test-driven development for every behavior change and commit each completed task independently.
- Ignore the unrelated untracked `smart-page-translator/` directory.

---

## File Map

- Create `src/lib/thumbnailDiagnostics.ts`: aggregate counters, timings, snapshots, subscriptions, and sanitized report formatting.
- Modify `src/lib/thumbnailScheduler.ts`: observable queue state, five priorities, bounded historical queue, and bounded completed handoff cache.
- Create `src/lib/modelThumbnailService.ts`: full-pipeline request coalescing and orchestration of cache, embedded preview, render, persistence, retry, and diagnostics.
- Create `src/lib/thumbnailFrameGate.ts`: one paint-friendly yield before heavy work without long idle timeouts.
- Create `src/components/ThumbnailQueueStatus.tsx`: delayed, layout-stable aggregate status.
- Create `src/components/PerformanceDiagnostics.tsx`: read-only Settings diagnostics and sanitized copy action.
- Create `src/lib/thumbnailBenchmark.ts`: scenario runner and aggregate benchmark report.
- Create `scripts/thumbnail-benchmark.cjs`: validated benchmark command and isolated Electron profile launcher.
- Modify `src/components/ModelCardThumbnail.tsx`: consume the unified service and selected/visible/nearby priorities.
- Modify `src/components/FolderCardThumbnail.tsx`: use mosaic priority through the unified service.
- Modify `src/components/ModelGrid.tsx`: pass selection state and display aggregate status.
- Modify `src/components/SettingsDialog.tsx`: add a Diagnostics tab without changing persisted settings.
- Modify `src/App.tsx`: subscribe once to diagnostics and pass snapshots to UI.
- Modify `electron/main.ts`, `electron/preload.cjs`, and `src/shared/preload.d.ts`: development benchmark bootstrap and sanitized report output only.
- Modify `src/styles.css`: fixed-size queue status and responsive diagnostics layout.
- Modify `package.json`: add `benchmark:thumbnails`.
- Modify `.gitignore`: exclude generated `benchmark-results/` reports; only the manually redacted aggregate table is committed.

---

### Task 1: Aggregate Thumbnail Diagnostics

**Files:**
- Create: `src/lib/thumbnailDiagnostics.ts`
- Create: `tests/unit/thumbnailDiagnostics.test.ts`

**Interfaces:**
- Produces: `ThumbnailPriority`, `ThumbnailStage`, `ThumbnailDiagnosticsSnapshot`, `createThumbnailDiagnostics()`, `observeThumbnailLongTasks()`, and `formatThumbnailDiagnosticReport()`.
- Consumes: injected `now(): number`; no browser globals are read directly.

- [ ] **Step 1: Write failing tests for counters, timings, subscriptions, reset, and redaction**

```ts
import { describe, expect, it } from "vitest";
import {
  createThumbnailDiagnostics,
  formatThumbnailDiagnosticReport
} from "../../src/lib/thumbnailDiagnostics";

it("publishes aggregate stage counts and durations", () => {
  let now = 10;
  const diagnostics = createThumbnailDiagnostics(() => now);
  const snapshots: number[] = [];
  const unsubscribe = diagnostics.subscribe((snapshot) => snapshots.push(snapshot.queued.total));
  const operation = diagnostics.start("io", "visible");
  expect(diagnostics.getSnapshot().queued.visible).toBe(1);
  operation.running();
  now = 34;
  operation.succeeded("cache");
  expect(diagnostics.getSnapshot()).toMatchObject({ cacheHits: 1, failures: 0 });
  expect(diagnostics.getSnapshot().durationMs.io.maximum).toBe(24);
  unsubscribe();
  expect(snapshots.length).toBeGreaterThan(1);
});

it("formats a report without identifying model data", () => {
  const diagnostics = createThumbnailDiagnostics(() => 10);
  const report = formatThumbnailDiagnosticReport(diagnostics.getSnapshot(), {
    appVersion: "0.1.0",
    electronVersion: "33.2.1",
    chromiumVersion: "130"
  });
  expect(report).toContain("cacheHits");
  expect(report).not.toContain("absolutePath");
  expect(report).not.toContain("filename");
});

it("records browser long tasks without retaining entry attribution", () => {
  const diagnostics = createThumbnailDiagnostics(() => 10);
  const observer = observeThumbnailLongTasks(diagnostics, fakePerformanceObserver([
    { duration: 125, name: "self", entryType: "longtask", startTime: 0 }
  ]));
  observer.start();
  expect(diagnostics.getSnapshot().longTasks).toEqual({ count: 1, maximumMs: 125 });
  observer.stop();
});

function fakePerformanceObserver(entries: PerformanceEntry[]) {
  return (callback: PerformanceObserverCallback) => ({
    observe: () => callback({ getEntries: () => entries } as PerformanceObserverEntryList, {} as PerformanceObserver),
    disconnect: () => undefined
  } as PerformanceObserver);
}
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npx vitest run tests/unit/thumbnailDiagnostics.test.ts`

Expected: FAIL because `src/lib/thumbnailDiagnostics.ts` does not exist.

- [ ] **Step 3: Implement aggregate-only diagnostics**

```ts
export type ThumbnailPriority = "selected" | "visible" | "nearby" | "mosaic" | "historical";
export type ThumbnailStage = "io" | "render";
export type ThumbnailResultSource = "cache" | "embedded" | "render";

export type ThumbnailDiagnosticsSnapshot = {
  queued: Record<ThumbnailPriority | "total", number>;
  running: Record<ThumbnailStage | "total", number>;
  cacheHits: number;
  cacheMisses: number;
  embeddedHits: number;
  renders: number;
  failures: number;
  discardedHistorical: number;
  longTasks: { count: number; maximumMs: number };
  retainedResults: { current: number; peak: number };
  durationMs: Record<ThumbnailStage | "total", { count: number; average: number; maximum: number }>;
};

export function createThumbnailDiagnostics(now: () => number = () => performance.now()) {
  const listeners = new Set<(snapshot: ThumbnailDiagnosticsSnapshot) => void>();
  const snapshot = createEmptyThumbnailDiagnosticsSnapshot();
  return {
    start(stage: ThumbnailStage, priority: ThumbnailPriority) {
      return createTrackedThumbnailOperation(snapshot, listeners, now, stage, priority);
    },
    recordLongTask(durationMs: number) {
      snapshot.longTasks.count += 1;
      snapshot.longTasks.maximumMs = Math.max(snapshot.longTasks.maximumMs, durationMs);
      publishThumbnailSnapshot(snapshot, listeners);
    },
    getSnapshot: () => structuredClone(snapshot),
    subscribe(listener: (value: ThumbnailDiagnosticsSnapshot) => void) {
      listeners.add(listener);
      listener(structuredClone(snapshot));
      return () => listeners.delete(listener);
    },
    reset: () => resetThumbnailDiagnosticsSnapshot(snapshot, listeners)
  };
}

export function formatThumbnailDiagnosticReport(
  snapshot: ThumbnailDiagnosticsSnapshot,
  runtime: { appVersion: string; electronVersion: string; chromiumVersion: string }
): string {
  return JSON.stringify({ generatedAt: new Date().toISOString(), runtime, thumbnail: snapshot }, null, 2);
}

export function observeThumbnailLongTasks(
  diagnostics: Pick<ReturnType<typeof createThumbnailDiagnostics>, "recordLongTask">,
  createObserver: (callback: PerformanceObserverCallback) => PerformanceObserver =
    (callback) => new PerformanceObserver(callback)
) {
  let observer: PerformanceObserver | null = null;
  return {
    start() {
      if (observer || typeof PerformanceObserver === "undefined") return;
      observer = createObserver((list) => {
        for (const entry of list.getEntries()) diagnostics.recordLongTask(entry.duration);
      });
      observer.observe({ entryTypes: ["longtask"] });
    },
    stop() {
      observer?.disconnect();
      observer = null;
    }
  };
}
```

Add private `createEmptyThumbnailDiagnosticsSnapshot`, `createTrackedThumbnailOperation`, `publishThumbnailSnapshot`, and `resetThumbnailDiagnosticsSnapshot` functions in the same file. They use immutable snapshots at the public boundary, clamp counters to non-negative integers, keep duration totals internally for averages, deliver the current snapshot immediately on subscription, and accept no path or filename parameters.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/unit/thumbnailDiagnostics.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/thumbnailDiagnostics.ts tests/unit/thumbnailDiagnostics.test.ts
git commit -m "feat: add thumbnail performance diagnostics"
```

---

### Task 2: Observable and Bounded Scheduler

**Files:**
- Modify: `src/lib/thumbnailScheduler.ts`
- Modify: `tests/unit/thumbnailScheduler.test.ts`

**Interfaces:**
- Consumes: `ThumbnailPriority` from `thumbnailDiagnostics.ts`.
- Produces: `ThumbnailSchedulerSnapshot`, `subscribe(listener)`, `clearCompleted(key?)`, and the existing `enqueue()` and `onIdle()` methods.

- [ ] **Step 1: Add failing scheduler tests**

```ts
it("orders selected, visible, nearby, mosaic, then historical work", async () => {
  const order: string[] = [];
  const scheduler = createThumbnailScheduler({ concurrency: 1 });
  scheduler.enqueue("block", "selected", deferredJob("block", order));
  scheduler.enqueue("historical", "historical", job("historical", order));
  scheduler.enqueue("mosaic", "mosaic", job("mosaic", order));
  scheduler.enqueue("nearby", "nearby", job("nearby", order));
  scheduler.enqueue("visible", "visible", job("visible", order));
  scheduler.enqueue("selected", "selected", job("selected", order));
  releaseDeferredJob("block");
  await scheduler.onIdle();
  expect(order).toEqual(["block", "selected", "visible", "nearby", "mosaic", "historical"]);
});

it("bounds unstarted historical jobs", async () => {
  const scheduler = createThumbnailScheduler({ concurrency: 1, maxHistoricalJobs: 2 });
  const active = scheduler.enqueue("active", "selected", controlledJob());
  const first = scheduler.enqueue("old-1", "historical", job("old-1", []));
  scheduler.enqueue("old-2", "historical", job("old-2", []));
  scheduler.enqueue("old-3", "historical", job("old-3", []));
  await expect(first.promise).resolves.toBeUndefined();
  expect(scheduler.getSnapshot().discardedHistorical).toBe(1);
  finishControlledJob();
  await active.promise;
});

it("expires completed handoff results and reports retained bounds", async () => {
  let now = 0;
  const scheduler = createThumbnailScheduler({
    concurrency: 1,
    completedTtlMs: 100,
    maxCompletedEntries: 2,
    now: () => now
  });
  await scheduler.enqueue("one", "visible", async () => "one").promise;
  await scheduler.enqueue("two", "visible", async () => "two").promise;
  await scheduler.enqueue("three", "visible", async () => "three").promise;
  expect(scheduler.getSnapshot().retainedResults).toBe(2);
  now = 101;
  scheduler.pruneCompleted();
  expect(scheduler.getSnapshot().retainedResults).toBe(0);
});
```

Use explicit deferred helpers in the test file so queued order is deterministic.

- [ ] **Step 2: Run scheduler tests and verify RED**

Run: `npx vitest run tests/unit/thumbnailScheduler.test.ts`

Expected: FAIL because the new priorities, bounds, snapshots, and methods are absent.

- [ ] **Step 3: Extend the scheduler without changing active-job semantics**

```ts
type ThumbnailSchedulerOptions = {
  concurrency?: number;
  maxHistoricalJobs?: number;
  maxCompletedEntries?: number;
  completedTtlMs?: number;
  now?: () => number;
};

type ThumbnailSchedulerSnapshot = {
  queued: Record<ThumbnailPriority, number>;
  active: number;
  retainedResults: number;
  discardedHistorical: number;
};

const PRIORITY_WEIGHT: Record<ThumbnailPriority, number> = {
  selected: 4,
  visible: 3,
  nearby: 2,
  mosaic: 1,
  historical: 0
};
```

Resolve discarded historical promises with `undefined` and type request promises as `Promise<T | undefined>`. Remove only unstarted jobs, never cancel an active job, prune completed entries before enqueue/getSnapshot, and notify subscribers only after state changes. The model thumbnail service converts a discarded `undefined` result to `null`, so component-facing behavior remains unchanged.

- [ ] **Step 4: Run scheduler and diagnostics tests**

Run: `npx vitest run tests/unit/thumbnailScheduler.test.ts tests/unit/thumbnailDiagnostics.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/thumbnailScheduler.ts tests/unit/thumbnailScheduler.test.ts
git commit -m "perf: bound and observe thumbnail scheduling"
```

---

### Task 3: Unified Model Thumbnail Service

**Files:**
- Create: `src/lib/modelThumbnailService.ts`
- Create: `tests/unit/modelThumbnailService.test.ts`
- Delete: `src/lib/modelThumbnailQueue.ts`
- Modify: `tests/unit/performanceContract.test.ts`

**Interfaces:**
- Consumes: `createThumbnailScheduler`, `createThumbnailDiagnostics`, `renderThumbnail`, `THUMBNAIL_RENDER_VERSION`, and injected model-library I/O functions.
- Produces: singleton `modelThumbnailService` plus testable `createModelThumbnailService(dependencies)` and public `ModelThumbnailRequest` handles that never expose scheduler discard values.

- [ ] **Step 1: Write failing full-pipeline tests**

```ts
it("coalesces requests before reading the disk cache", async () => {
  const cacheRead = vi.fn(async () => "data:image/webp;base64,UklGRgAAAABXRUJQ");
  const service = createModelThumbnailService(dependencies({ readCachedThumbnail: cacheRead }));
  const first = service.request(model(), "nearby");
  const second = service.request(model(), "visible");
  await expect(Promise.all([first.promise, second.promise])).resolves.toEqual([
    "data:image/webp;base64,UklGRgAAAABXRUJQ",
    "data:image/webp;base64,UklGRgAAAABXRUJQ"
  ]);
  expect(cacheRead).toHaveBeenCalledTimes(1);
});

it("uses an embedded 3MF image before generated rendering", async () => {
  const render = vi.fn();
  const service = createModelThumbnailService(dependencies({
    readCachedThumbnail: async () => null,
    readEmbeddedThumbnail: async () => "data:image/png;base64,iVBORw0KGgo=",
    renderThumbnail: render
  }));
  await expect(service.request(model({ extension: ".3mf" }), "visible").promise)
    .resolves.toContain("image/png");
  expect(render).not.toHaveBeenCalled();
});

it("settles one failed render and continues with the next model", async () => {
  const render = vi.fn()
    .mockRejectedValueOnce(new Error("broken mesh"))
    .mockResolvedValueOnce("data:image/webp;base64,UklGRgAAAABXRUJQ");
  const service = createModelThumbnailService(dependencies({ renderThumbnail: render }));
  await expect(service.request(model({ absolutePath: "C:\\Models\\bad.stl" }), "visible").promise)
    .resolves.toBeNull();
  await expect(service.request(model({ absolutePath: "C:\\Models\\good.stl" }), "visible").promise)
    .resolves.toContain("image/webp");
});
```

- [ ] **Step 2: Run service tests and verify RED**

Run: `npx vitest run tests/unit/modelThumbnailService.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the service and migrate the performance contract**

```ts
export type ModelThumbnailServiceDependencies = {
  readCachedThumbnail: (model: ModelFile) => Promise<string | null>;
  readEmbeddedThumbnail: (absolutePath: string) => Promise<string | null>;
  readModelFile: (absolutePath: string) => Promise<ArrayBuffer>;
  writeCachedThumbnail: (model: ModelFile, dataUrl: string) => Promise<void>;
  renderThumbnail: typeof renderThumbnail;
  yieldBeforeRender: () => Promise<void>;
};

export type ModelThumbnailService = {
  request: (model: ModelFile, priority: ThumbnailPriority) => ModelThumbnailRequest;
  retry: (model: ModelFile) => void;
  subscribe: (listener: (snapshot: ThumbnailDiagnosticsSnapshot) => void) => () => void;
  getDiagnostics: () => ThumbnailDiagnosticsSnapshot;
  onIdle: () => Promise<void>;
};

export type ModelThumbnailRequest = {
  promise: Promise<string | null>;
  setPriority: (priority: ThumbnailPriority) => void;
  release: () => void;
};
```

Use an I/O scheduler with concurrency `4`, a render scheduler with concurrency `1`, and a pipeline-entry map keyed before cache lookup. Await cache persistence before removing the pipeline entry; resolve the image to consumers even if persistence fails. Session failures are retained by signature until `retry(model)` or a changed signature. Archives return `null` synchronously through an already-resolved handle.

Update `performanceContract.test.ts` to assert that components import `modelThumbnailService`, cache lookup exists only in the service, and geometry rendering remains one-at-a-time.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/unit/modelThumbnailService.test.ts tests/unit/thumbnailScheduler.test.ts tests/unit/performanceContract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/modelThumbnailService.ts src/lib/modelThumbnailQueue.ts tests/unit/modelThumbnailService.test.ts tests/unit/performanceContract.test.ts
git commit -m "refactor: unify thumbnail loading pipeline"
```

---

### Task 4: Selected, Visible, Nearby, and Mosaic Consumers

**Files:**
- Modify: `src/components/ModelCardThumbnail.tsx`
- Modify: `src/components/FolderCardThumbnail.tsx`
- Modify: `src/components/ModelGrid.tsx`
- Modify: `tests/unit/performanceContract.test.ts`
- Modify: `tests/unit/productFlowContract.test.ts`

**Interfaces:**
- Consumes: `modelThumbnailService.request(model, priority)`.
- Produces: `ModelCardThumbnail({ model, selected })`; folder mosaics always request `mosaic` priority.

- [ ] **Step 1: Add failing consumer-contract tests**

```ts
it("gives the selected card priority and uses mosaic priority for folders", async () => {
  const card = await readFile("src/components/ModelCardThumbnail.tsx", "utf8");
  const folder = await readFile("src/components/FolderCardThumbnail.tsx", "utf8");
  const grid = await readFile("src/components/ModelGrid.tsx", "utf8");
  expect(card).toContain('selected ? "selected" : "nearby"');
  expect(card).toContain('entry.isIntersecting ? (selected ? "selected" : "visible") : "nearby"');
  expect(folder).toContain('request(model, "mosaic")');
  expect(grid).toContain('<ModelCardThumbnail model={model} selected={isSelected}');
});
```

- [ ] **Step 2: Run contract tests and verify RED**

Run: `npx vitest run tests/unit/performanceContract.test.ts tests/unit/productFlowContract.test.ts`

Expected: FAIL because the old queue and three-priority API remain.

- [ ] **Step 3: Migrate React consumers**

```tsx
export function ModelCardThumbnail({ model, selected }: { model: ModelFile; selected: boolean }) {
  const initialPriority: ThumbnailPriority = selected ? "selected" : "nearby";
  // Request once per signature; IntersectionObserver updates selected/visible/nearby priority.
}

export function loadFolderMosaicThumbnail(model: ModelFile) {
  const request = modelThumbnailService.request(model, "mosaic");
  return request.promise.finally(request.release);
}
```

Pass `isSelected` through both card and list render paths. Preserve fixed placeholders, existing observers, archive fallbacks, folder mosaic limits, and cleanup releases.

- [ ] **Step 4: Run component contracts and scheduler tests**

Run: `npx vitest run tests/unit/performanceContract.test.ts tests/unit/productFlowContract.test.ts tests/unit/thumbnailScheduler.test.ts tests/unit/modelThumbnailService.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/ModelCardThumbnail.tsx src/components/FolderCardThumbnail.tsx src/components/ModelGrid.tsx tests/unit/performanceContract.test.ts tests/unit/productFlowContract.test.ts
git commit -m "perf: prioritize selected and visible thumbnails"
```

---

### Task 5: Paint-Friendly Render Gate and Targeted Retry

**Files:**
- Create: `src/lib/thumbnailFrameGate.ts`
- Create: `tests/unit/thumbnailFrameGate.test.ts`
- Modify: `src/lib/modelThumbnailService.ts`
- Modify: `src/components/ModelGrid.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/unit/modelThumbnailService.test.ts`
- Modify: `tests/unit/contextMenuContract.test.ts`

**Interfaces:**
- Produces: `yieldBeforeThumbnailRender(scheduleFrame?)` and model context action `onRetryThumbnail(model)`.
- Consumes: `modelThumbnailService.retry(model)`.

- [ ] **Step 1: Write failing frame-gate and retry tests**

```ts
it("yields exactly one animation frame before resolving", async () => {
  const callbacks: FrameRequestCallback[] = [];
  const promise = yieldBeforeThumbnailRender((callback) => {
    callbacks.push(callback);
    return 1;
  });
  expect(callbacks).toHaveLength(1);
  let settled = false;
  void promise.then(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  callbacks[0](16);
  await expect(promise).resolves.toBeUndefined();
});

it("allows a targeted retry after a session failure", async () => {
  const render = vi.fn()
    .mockRejectedValueOnce(new Error("bad"))
    .mockResolvedValueOnce("data:image/webp;base64,UklGRgAAAABXRUJQ");
  const service = createModelThumbnailService(dependencies({ renderThumbnail: render }));
  const target = model();
  await expect(service.request(target, "visible").promise).resolves.toBeNull();
  await expect(service.request(target, "visible").promise).resolves.toBeNull();
  expect(render).toHaveBeenCalledTimes(1);
  service.retry(target);
  await expect(service.request(target, "visible").promise).resolves.toContain("image/webp");
  expect(render).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run tests/unit/thumbnailFrameGate.test.ts tests/unit/modelThumbnailService.test.ts tests/unit/contextMenuContract.test.ts`

Expected: FAIL because the frame gate and retry action do not exist.

- [ ] **Step 3: Implement one-frame yielding and context retry**

```ts
export function yieldBeforeThumbnailRender(
  scheduleFrame: typeof requestAnimationFrame = requestAnimationFrame
): Promise<void> {
  return new Promise((resolve) => scheduleFrame(() => resolve()));
}
```

Use this once immediately before `readModelFile` plus synchronous parse/render; remove both `requestIdleCallback` waits. Add `Tentar miniatura novamente` to the model context menu, close the menu after invoking it, clear only that model signature's session failure and handoff entry, and remount that thumbnail through a retry generation counter in `App` passed to `ModelGrid`.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/unit/thumbnailFrameGate.test.ts tests/unit/modelThumbnailService.test.ts tests/unit/contextMenuContract.test.ts tests/unit/interactionFlowContract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/thumbnailFrameGate.ts src/lib/modelThumbnailService.ts src/components/ModelGrid.tsx src/App.tsx tests/unit/thumbnailFrameGate.test.ts tests/unit/modelThumbnailService.test.ts tests/unit/contextMenuContract.test.ts
git commit -m "perf: yield before thumbnail rendering"
```

---

### Task 6: Queue Status and Settings Diagnostics

**Files:**
- Create: `src/components/ThumbnailQueueStatus.tsx`
- Create: `src/components/PerformanceDiagnostics.tsx`
- Create: `tests/unit/thumbnailQueueStatus.test.tsx`
- Modify: `src/components/ModelGrid.tsx`
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `tests/unit/layoutContract.test.ts`

**Interfaces:**
- Consumes: `ThumbnailDiagnosticsSnapshot`, `modelThumbnailService.subscribe()`, and `formatThumbnailDiagnosticReport()`.
- Produces: delayed queue status and a non-persisted `diagnostics` Settings tab.

- [ ] **Step 1: Write failing status behavior tests**

```tsx
it("does not flash for work that finishes before 250 ms", () => {
  vi.useFakeTimers();
  const { rerender, queryByText } = render(<ThumbnailQueueStatus snapshot={busyIoSnapshot(2)} />);
  rerender(<ThumbnailQueueStatus snapshot={idleSnapshot()} />);
  vi.advanceTimersByTime(250);
  expect(queryByText(/miniaturas/i)).toBeNull();
});

it("shows render work after the delay and completion briefly", () => {
  vi.useFakeTimers();
  const { rerender, getByText } = render(<ThumbnailQueueStatus snapshot={busyRenderSnapshot(8)} />);
  vi.advanceTimersByTime(250);
  expect(getByText("Gerando miniaturas - 8")).toBeVisible();
  rerender(<ThumbnailQueueStatus snapshot={idleSnapshot({ renders: 8 })} />);
  expect(getByText("Miniaturas concluidas")).toBeVisible();
});
```

- [ ] **Step 2: Run status and layout tests and verify RED**

Run: `npx vitest run tests/unit/thumbnailQueueStatus.test.tsx tests/unit/layoutContract.test.ts`

Expected: FAIL because the components and diagnostics tab do not exist.

- [ ] **Step 3: Implement stable aggregate feedback and diagnostics tab**

```tsx
<ThumbnailQueueStatus snapshot={thumbnailDiagnostics} delayMs={250} completionMs={1800} />
```

Add the status beside the existing library/monitor status inside a fixed-height container. Use `aria-live="polite"`, no per-card spinners, and failure wording from the specification. Add a `Desempenho` Settings tab with aggregate counts/durations, `Copiar diagnostico`, and a short privacy note. Use `navigator.clipboard.writeText(formatThumbnailDiagnosticReport(snapshot, runtime))`; runtime versions come from a safe preload method returning version strings only.

Start `observeThumbnailLongTasks()` once in `App` and disconnect it during effect cleanup. Only duration and count enter diagnostics; discard browser attribution fields entirely.

CSS must keep toolbar height stable, use existing theme variables, constrain diagnostic values with tabular numerals, and collapse the diagnostic grid to one column below the existing responsive breakpoint.

- [ ] **Step 4: Run component, layout, and settings contracts**

Run: `npx vitest run tests/unit/thumbnailQueueStatus.test.tsx tests/unit/layoutContract.test.ts tests/unit/settingsStore.test.ts tests/unit/productFlowContract.test.ts`

Expected: PASS, with no new persisted settings fields.

- [ ] **Step 5: Commit**

```powershell
git add src/components/ThumbnailQueueStatus.tsx src/components/PerformanceDiagnostics.tsx src/components/ModelGrid.tsx src/components/SettingsDialog.tsx src/App.tsx src/styles.css tests/unit/thumbnailQueueStatus.test.tsx tests/unit/layoutContract.test.ts
git commit -m "feat: show thumbnail queue diagnostics"
```

---

### Task 7: Read-Only Development Benchmark

**Files:**
- Create: `src/lib/thumbnailBenchmark.ts`
- Create: `tests/unit/thumbnailBenchmark.test.ts`
- Create: `scripts/thumbnail-benchmark.cjs`
- Modify: `electron/main.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/shared/preload.d.ts`
- Modify: `src/App.tsx`
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `tests/unit/thumbnailBenchmarkContract.test.ts`

**Interfaces:**
- Consumes: `modelThumbnailService`, `LibraryScanResult`, and benchmark-only preload configuration.
- Produces: `npm run benchmark:thumbnails -- --library <absolute-path> --scenario <cold|warm|scroll>` and sanitized JSON output under `benchmark-results/`.

- [ ] **Step 1: Write failing parser, sanitization, and benchmark-runner tests**

```ts
it("rejects a missing or relative benchmark library path", () => {
  expect(() => parseArguments(["--scenario", "warm"])).toThrow("--library is required");
  expect(() => parseArguments(["--library", "models", "--scenario", "warm"]))
    .toThrow("--library must be absolute");
});

it("creates a sanitized aggregate report", async () => {
  const report = await runThumbnailBenchmark({
    scenario: "scroll",
    models: [model({ absolutePath: "C:\\Private\\secret-name.stl" })],
    request: async () => null,
    now: sequenceClock([0, 20, 35, 80]),
    diagnostics: () => diagnosticsSnapshot()
  });
  const text = JSON.stringify(report);
  expect(text).not.toContain("Private");
  expect(text).not.toContain("secret-name");
  expect(report.modelCount).toBe(1);
});
```

- [ ] **Step 2: Run benchmark tests and verify RED**

Run: `npx vitest run tests/unit/thumbnailBenchmark.test.ts tests/unit/thumbnailBenchmarkContract.test.ts`

Expected: FAIL because the benchmark parser, runner, command, and preload contract do not exist.

- [ ] **Step 3: Implement isolated benchmark mode**

```json
{
  "scripts": {
    "benchmark:thumbnails": "node scripts/thumbnail-benchmark.cjs"
  }
}
```

The command exports `parseArguments` and starts only under `if (require.main === module)`. It validates the library with `path.isAbsolute`, validates the scenario against `cold`, `warm`, and `scroll`, creates a temporary user-data directory under `os.tmpdir()`, and spawns Electron with `MODEL_LIBRARY_BENCHMARK_ROOT`, `MODEL_LIBRARY_BENCHMARK_SCENARIO`, `MODEL_LIBRARY_BENCHMARK_OUTPUT`, and `MODEL_LIBRARY_BENCHMARK_USER_DATA`. Add `benchmark-results/` to `.gitignore`.

Before `app.whenReady()`, Electron calls `app.setPath("userData", benchmarkUserData)` when benchmark mode is active. In benchmark mode, do not open the portable metadata repository or watcher; scan models read-only, expose the sanitized benchmark configuration through preload, accept one fixed-schema aggregate report, write it only to the predetermined output path, then quit. The renderer requests models through the normal thumbnail service and simulates viewport priority windows for `scroll`; it never sends paths back in the report.

For `cold`, measure the first request pass against the empty temporary profile. For `warm`, first populate that same temporary profile, reset diagnostics, then measure a second pass before quitting. For `scroll`, start empty and rotate a fixed window of selected/visible/nearby priorities while generation proceeds. Thus every command remains isolated while the warm scenario still measures real disk-cache reuse.

- [ ] **Step 4: Run focused tests and a small real-library smoke benchmark**

Run: `npx vitest run tests/unit/thumbnailBenchmark.test.ts tests/unit/thumbnailBenchmarkContract.test.ts tests/unit/preloadContract.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `npm run benchmark:thumbnails -- --library "C:\Models" --scenario warm`

Expected: Electron exits by itself, creates one JSON report under `benchmark-results/`, does not create or modify `.3d-model-library`, and the report contains no model names or paths.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/thumbnailBenchmark.ts scripts/thumbnail-benchmark.cjs electron/main.ts electron/preload.cjs src/shared/preload.d.ts src/App.tsx package.json .gitignore tests/unit/thumbnailBenchmark.test.ts tests/unit/thumbnailBenchmarkContract.test.ts
git commit -m "test: add isolated thumbnail benchmark"
```

---

### Task 8: Baseline Comparison and Full Regression Gate

**Files:**
- Modify: `README.md`
- Create: `docs/performance/thumbnail-benchmark-baseline.md`
- Modify: `tests/unit/performanceContract.test.ts`

**Interfaces:**
- Consumes: benchmark JSON reports from Task 7.
- Produces: reproducible benchmark instructions and a redacted before/after aggregate table.

- [ ] **Step 1: Add a failing final performance contract**

```ts
it("documents bounded thumbnail memory and benchmark commands", async () => {
  const readme = await readFile("README.md", "utf8");
  const baseline = await readFile("docs/performance/thumbnail-benchmark-baseline.md", "utf8");
  const scheduler = await readFile("src/lib/thumbnailScheduler.ts", "utf8");
  expect(readme).toContain("npm run benchmark:thumbnails");
  expect(baseline).toContain("Cold thumbnails");
  expect(baseline).toContain("Warm thumbnails");
  expect(baseline).toContain("Scroll stress");
  expect(scheduler).toContain("maxCompletedEntries");
  expect(scheduler).toContain("maxHistoricalJobs");
});
```

- [ ] **Step 2: Run the final contract and verify RED**

Run: `npx vitest run tests/unit/performanceContract.test.ts`

Expected: FAIL because benchmark documentation and the baseline table are absent.

- [ ] **Step 3: Run cold, warm, and scroll scenarios and document exact aggregate results**

```powershell
npm run benchmark:thumbnails -- --library "C:\Models" --scenario cold
npm run benchmark:thumbnails -- --library "C:\Models" --scenario warm
npm run benchmark:thumbnails -- --library "C:\Models" --scenario scroll
```

Write `docs/performance/thumbnail-benchmark-baseline.md` with the report date, hardware summary supplied by the user (`RTX 4060`, `Xeon E5-2690 v4`), model count, aggregate file-size buckets, timings, queue peaks, retained-result peaks, cache/render/failure counts, and long-task counts. Do not include filenames or paths. Add the command and privacy behavior to README.

- [ ] **Step 4: Run every regression gate**

Run: `npx vitest run tests/unit`

Expected: all application unit tests pass.

Run: `npm run build`

Expected: TypeScript and Vite builds pass; the existing bundle-size warning is acceptable.

Run: `git diff --check`

Expected: no whitespace errors.

Manually verify in the development app:

```text
1. Open the cached library and confirm the grid appears before reconciliation finishes.
2. Scroll rapidly down and back up; visible thumbnails overtake folder mosaics.
3. Select an uncached model; its thumbnail becomes the highest-priority queued item.
4. Open Settings > Desempenho and copy a report; verify no identifying model data appears.
5. Retry one failed thumbnail from its context menu.
6. Move a model into an internal folder and undo.
7. Drag STL and 3MF files externally to Cura and Creality Print.
```

- [ ] **Step 5: Commit documentation and final contracts**

```powershell
git add README.md docs/performance/thumbnail-benchmark-baseline.md tests/unit/performanceContract.test.ts
git commit -m "docs: record thumbnail performance baseline"
```

---

## Completion Gate

Before claiming this phase complete:

```powershell
npx vitest run tests/unit
npm run build
git diff --check
git status --short
```

Confirm that only the unrelated pre-existing `smart-page-translator/` directory remains untracked, all eight task commits exist, benchmark reports contain no paths or filenames, and worker-based parsing remains deferred unless the recorded results justify a new design.
