export type ThumbnailPriority = "selected" | "visible" | "nearby" | "mosaic" | "historical";
export type ThumbnailStage = "io" | "render";
export type ThumbnailResultSource = "cache" | "embedded" | "render";

type DurationSummary = { count: number; average: number; maximum: number };

export type ThumbnailDiagnosticsSnapshot = {
  queued: Record<ThumbnailPriority | "total", number>;
  queuedByStage: Record<ThumbnailStage | "total", number>;
  running: Record<ThumbnailStage | "total", number>;
  cacheHits: number;
  cacheMisses: number;
  embeddedHits: number;
  renders: number;
  failures: number;
  failuresByExtension: Record<string, number>;
  discardedHistorical: number;
  longTasks: { count: number; maximumMs: number };
  retainedResults: { current: number; peak: number };
  queueWaitMs: Record<ThumbnailStage, DurationSummary>;
  durationMs: Record<ThumbnailStage | "total", DurationSummary>;
};

type ThumbnailSnapshotListener = (snapshot: ThumbnailDiagnosticsSnapshot) => void;
type DurationTotals = Record<ThumbnailStage | "total", number>;

const durationTotalsBySnapshot = new WeakMap<ThumbnailDiagnosticsSnapshot, DurationTotals>();
const queueWaitTotalsBySnapshot = new WeakMap<
  ThumbnailDiagnosticsSnapshot,
  Record<ThumbnailStage, number>
>();
const generationBySnapshot = new WeakMap<ThumbnailDiagnosticsSnapshot, number>();

const defaultPerformanceObserverFactory = (callback: PerformanceObserverCallback) =>
  new PerformanceObserver(callback);

export function createThumbnailDiagnostics(now: () => number = () => performance.now()) {
  const listeners = new Set<ThumbnailSnapshotListener>();
  const snapshot = createEmptyThumbnailDiagnosticsSnapshot();
  return {
    startRequest() {
      return createTrackedThumbnailRequest(snapshot, listeners, now);
    },
    start(stage: ThumbnailStage, priority: ThumbnailPriority, extension?: string) {
      return createTrackedThumbnailOperation(snapshot, listeners, now, stage, priority, extension);
    },
    recordCacheMiss() {
      snapshot.cacheMisses += 1;
      publishThumbnailSnapshot(snapshot, listeners);
    },
    recordLongTask(durationMs: number) {
      snapshot.longTasks.count += 1;
      snapshot.longTasks.maximumMs = Math.max(
        snapshot.longTasks.maximumMs,
        normalizeDuration(durationMs)
      );
      publishThumbnailSnapshot(snapshot, listeners);
    },
    getSnapshot: () => structuredClone(snapshot),
    subscribe(listener: ThumbnailSnapshotListener) {
      listeners.add(listener);
      listener(structuredClone(snapshot));
      return () => listeners.delete(listener);
    },
    reset: () => resetThumbnailDiagnosticsSnapshot(snapshot, listeners)
  };
}

export function formatThumbnailDiagnosticReport(
  snapshot: ThumbnailDiagnosticsSnapshot,
  runtime: { appVersion: string; electronVersion: string; chromiumVersion: string },
  library?: { rootPath: string; libraryId: string } | null
): string {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    runtime: {
      appVersion: runtime.appVersion,
      electronVersion: runtime.electronVersion,
      chromiumVersion: runtime.chromiumVersion
    },
    ...(library ? {
      library: { rootPath: library.rootPath, libraryId: library.libraryId }
    } : {}),
    thumbnail: sanitizeThumbnailSnapshot(snapshot)
  }, null, 2);
}

export function observeThumbnailLongTasks(
  diagnostics: Pick<ReturnType<typeof createThumbnailDiagnostics>, "recordLongTask">,
  createObserver: (callback: PerformanceObserverCallback) => PerformanceObserver =
    defaultPerformanceObserverFactory
) {
  let observer: PerformanceObserver | null = null;
  return {
    start() {
      if (observer) return;
      if (
        createObserver === defaultPerformanceObserverFactory &&
        typeof PerformanceObserver === "undefined"
      ) return;
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

function createEmptyThumbnailDiagnosticsSnapshot(): ThumbnailDiagnosticsSnapshot {
  const snapshot: ThumbnailDiagnosticsSnapshot = {
    queued: { selected: 0, visible: 0, nearby: 0, mosaic: 0, historical: 0, total: 0 },
    queuedByStage: { io: 0, render: 0, total: 0 },
    running: { io: 0, render: 0, total: 0 },
    cacheHits: 0,
    cacheMisses: 0,
    embeddedHits: 0,
    renders: 0,
    failures: 0,
    failuresByExtension: {},
    discardedHistorical: 0,
    longTasks: { count: 0, maximumMs: 0 },
    retainedResults: { current: 0, peak: 0 },
    queueWaitMs: {
      io: { count: 0, average: 0, maximum: 0 },
      render: { count: 0, average: 0, maximum: 0 }
    },
    durationMs: {
      io: { count: 0, average: 0, maximum: 0 },
      render: { count: 0, average: 0, maximum: 0 },
      total: { count: 0, average: 0, maximum: 0 }
    }
  };
  durationTotalsBySnapshot.set(snapshot, { io: 0, render: 0, total: 0 });
  queueWaitTotalsBySnapshot.set(snapshot, { io: 0, render: 0 });
  generationBySnapshot.set(snapshot, 0);
  return snapshot;
}

function createTrackedThumbnailOperation(
  snapshot: ThumbnailDiagnosticsSnapshot,
  listeners: Set<ThumbnailSnapshotListener>,
  now: () => number,
  stage: ThumbnailStage,
  priority: ThumbnailPriority,
  extension?: string
) {
  const queuedAt = now();
  let runningAt: number | null = null;
  const generation = generationBySnapshot.get(snapshot);
  let state: "queued" | "running" | "settled" = "queued";
  increment(snapshot.queued, priority);
  increment(snapshot.queued, "total");
  increment(snapshot.queuedByStage, stage);
  increment(snapshot.queuedByStage, "total");
  publishThumbnailSnapshot(snapshot, listeners);

  function settle(result?: ThumbnailResultSource, failed = false) {
    if (generationBySnapshot.get(snapshot) !== generation) return;
    if (state === "settled") return;
    if (state === "queued") {
      decrement(snapshot.queued, priority);
      decrement(snapshot.queued, "total");
      decrement(snapshot.queuedByStage, stage);
      decrement(snapshot.queuedByStage, "total");
      recordQueueWait(snapshot, stage, normalizeDuration(now() - queuedAt));
    } else {
      decrement(snapshot.running, stage);
      decrement(snapshot.running, "total");
    }
    state = "settled";

    if (failed) {
      snapshot.failures += 1;
      if (extension) {
        const normalizedExtension = extension.toLowerCase();
        snapshot.failuresByExtension[normalizedExtension] =
          (snapshot.failuresByExtension[normalizedExtension] ?? 0) + 1;
      }
    } else if (result) {
      recordResult(snapshot, result);
    }
    if (runningAt !== null) {
      recordStageDuration(snapshot, stage, normalizeDuration(now() - runningAt));
    }
    publishThumbnailSnapshot(snapshot, listeners);
  }

  return {
    running() {
      if (generationBySnapshot.get(snapshot) !== generation) return;
      if (state !== "queued") return;
      decrement(snapshot.queued, priority);
      decrement(snapshot.queued, "total");
      decrement(snapshot.queuedByStage, stage);
      decrement(snapshot.queuedByStage, "total");
      increment(snapshot.running, stage);
      increment(snapshot.running, "total");
      runningAt = now();
      recordQueueWait(snapshot, stage, normalizeDuration(runningAt - queuedAt));
      state = "running";
      publishThumbnailSnapshot(snapshot, listeners);
    },
    succeeded(source?: ThumbnailResultSource) {
      settle(source);
    },
    failed() {
      settle(undefined, true);
    }
  };
}

function createTrackedThumbnailRequest(
  snapshot: ThumbnailDiagnosticsSnapshot,
  listeners: Set<ThumbnailSnapshotListener>,
  now: () => number
) {
  const startedAt = now();
  const generation = generationBySnapshot.get(snapshot);
  let isSettled = false;
  return {
    settled() {
      if (generationBySnapshot.get(snapshot) !== generation || isSettled) return;
      isSettled = true;
      const durationMs = normalizeDuration(now() - startedAt);
      const totals = durationTotalsBySnapshot.get(snapshot);
      if (!totals) return;
      updateDurationSummary(snapshot.durationMs.total, totals, "total", durationMs);
      publishThumbnailSnapshot(snapshot, listeners);
    }
  };
}

function recordResult(snapshot: ThumbnailDiagnosticsSnapshot, source: ThumbnailResultSource) {
  if (source === "cache") {
    snapshot.cacheHits += 1;
    return;
  }
  if (source === "embedded") snapshot.embeddedHits += 1;
  if (source === "render") snapshot.renders += 1;
}

function recordStageDuration(
  snapshot: ThumbnailDiagnosticsSnapshot,
  stage: ThumbnailStage,
  durationMs: number
) {
  const totals = durationTotalsBySnapshot.get(snapshot);
  if (!totals) return;
  updateDurationSummary(snapshot.durationMs[stage], totals, stage, durationMs);
}

function recordQueueWait(
  snapshot: ThumbnailDiagnosticsSnapshot,
  stage: ThumbnailStage,
  durationMs: number
) {
  const totals = queueWaitTotalsBySnapshot.get(snapshot);
  if (!totals) return;
  totals[stage] += durationMs;
  const summary = snapshot.queueWaitMs[stage];
  summary.count += 1;
  summary.average = totals[stage] / summary.count;
  summary.maximum = Math.max(summary.maximum, durationMs);
}

function updateDurationSummary(
  summary: DurationSummary,
  totals: DurationTotals,
  key: ThumbnailStage | "total",
  durationMs: number
) {
  totals[key] += durationMs;
  summary.count += 1;
  summary.average = totals[key] / summary.count;
  summary.maximum = Math.max(summary.maximum, durationMs);
}

function publishThumbnailSnapshot(
  snapshot: ThumbnailDiagnosticsSnapshot,
  listeners: Set<ThumbnailSnapshotListener>
) {
  for (const listener of listeners) listener(structuredClone(snapshot));
}

function resetThumbnailDiagnosticsSnapshot(
  snapshot: ThumbnailDiagnosticsSnapshot,
  listeners: Set<ThumbnailSnapshotListener>
) {
  const nextGeneration = (generationBySnapshot.get(snapshot) ?? 0) + 1;
  const empty = createEmptyThumbnailDiagnosticsSnapshot();
  Object.assign(snapshot, empty);
  durationTotalsBySnapshot.set(snapshot, { io: 0, render: 0, total: 0 });
  queueWaitTotalsBySnapshot.set(snapshot, { io: 0, render: 0 });
  generationBySnapshot.set(snapshot, nextGeneration);
  publishThumbnailSnapshot(snapshot, listeners);
}

function sanitizeThumbnailSnapshot(
  snapshot: ThumbnailDiagnosticsSnapshot
): ThumbnailDiagnosticsSnapshot {
  return {
    queued: {
      selected: snapshot.queued.selected,
      visible: snapshot.queued.visible,
      nearby: snapshot.queued.nearby,
      mosaic: snapshot.queued.mosaic,
      historical: snapshot.queued.historical,
      total: snapshot.queued.total
    },
    queuedByStage: {
      io: snapshot.queuedByStage.io,
      render: snapshot.queuedByStage.render,
      total: snapshot.queuedByStage.total
    },
    running: {
      io: snapshot.running.io,
      render: snapshot.running.render,
      total: snapshot.running.total
    },
    cacheHits: snapshot.cacheHits,
    cacheMisses: snapshot.cacheMisses,
    embeddedHits: snapshot.embeddedHits,
    renders: snapshot.renders,
    failures: snapshot.failures,
    failuresByExtension: { ...snapshot.failuresByExtension },
    discardedHistorical: snapshot.discardedHistorical,
    longTasks: {
      count: snapshot.longTasks.count,
      maximumMs: snapshot.longTasks.maximumMs
    },
    retainedResults: {
      current: snapshot.retainedResults.current,
      peak: snapshot.retainedResults.peak
    },
    queueWaitMs: {
      io: { ...snapshot.queueWaitMs.io },
      render: { ...snapshot.queueWaitMs.render }
    },
    durationMs: {
      io: { ...snapshot.durationMs.io },
      render: { ...snapshot.durationMs.render },
      total: { ...snapshot.durationMs.total }
    }
  };
}

function increment<T extends string>(counters: Record<T, number>, key: T) {
  counters[key] = Math.max(0, Math.trunc(counters[key])) + 1;
}

function decrement<T extends string>(counters: Record<T, number>, key: T) {
  counters[key] = Math.max(0, Math.trunc(counters[key]) - 1);
}

function normalizeDuration(durationMs: number) {
  return Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
}
