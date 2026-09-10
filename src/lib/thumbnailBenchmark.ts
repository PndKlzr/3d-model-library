import type { ModelThumbnailRequest } from "./modelThumbnailService";
import type {
  ThumbnailDiagnosticsSnapshot,
  ThumbnailPriority
} from "./thumbnailDiagnostics";
import type { ModelFile } from "../shared/types";

export type ThumbnailBenchmarkScenario = "cold" | "warm" | "scroll";
export type ThumbnailBenchmarkRequest = Pick<
  ModelThumbnailRequest,
  "promise" | "setPriority" | "release"
>;

export type ThumbnailBenchmarkReport = {
  schemaVersion: 1;
  scenario: ThumbnailBenchmarkScenario;
  generatedAt: string;
  runtime: {
    appVersion: string;
    electronVersion: string;
    chromiumVersion: string;
  };
  modelCount: number;
  sizeBuckets: {
    under1MiB: number;
    oneToTenMiB: number;
    overTenMiB: number;
  };
  timingsMs: {
    libraryScanReady: number;
    firstVisibleThumbnail: number | null;
    initiallyVisibleSettled: number;
    fullReconciliation: number;
  };
  queuePeak: number;
  thumbnail: ThumbnailDiagnosticsSnapshot;
};

type BenchmarkOptions = {
  scenario: ThumbnailBenchmarkScenario;
  models: ModelFile[];
  request: (model: ModelFile, priority: ThumbnailPriority) => ThumbnailBenchmarkRequest;
  diagnostics: () => ThumbnailDiagnosticsSnapshot;
  resetDiagnostics?: () => void;
  now?: () => number;
  generatedAt?: () => string;
  runtime?: ThumbnailBenchmarkReport["runtime"];
  libraryScanReadyMs?: number;
  waitForFrame?: () => Promise<void>;
};

type PassResult = {
  timingsMs: ThumbnailBenchmarkReport["timingsMs"];
  queuePeak: number;
};

const INITIAL_VISIBLE_COUNT = 24;
const SCROLL_STEP = 12;
const MEBIBYTE = 1024 * 1024;

export async function runThumbnailBenchmark(
  options: BenchmarkOptions
): Promise<ThumbnailBenchmarkReport> {
  const now = options.now ?? (() => performance.now());
  const supportedModels = options.models.filter(
    (model) => model.extension === ".stl" || model.extension === ".3mf"
  );

  if (options.scenario === "warm") {
    await runStandardPass(supportedModels, options.request, options.diagnostics, now);
    options.resetDiagnostics?.();
  }

  const pass = options.scenario === "scroll"
    ? await runScrollPass(
        supportedModels,
        options.request,
        options.diagnostics,
        now,
        options.waitForFrame ?? defaultFrameWait
      )
    : await runStandardPass(supportedModels, options.request, options.diagnostics, now);

  return {
    schemaVersion: 1,
    scenario: options.scenario,
    generatedAt: (options.generatedAt ?? (() => new Date().toISOString()))(),
    runtime: sanitizeRuntime(options.runtime),
    modelCount: supportedModels.length,
    sizeBuckets: countSizeBuckets(supportedModels),
    timingsMs: {
      ...pass.timingsMs,
      libraryScanReady: normalizeDuration(options.libraryScanReadyMs ?? 0)
    },
    queuePeak: pass.queuePeak,
    thumbnail: sanitizeDiagnostics(options.diagnostics())
  };
}

function sanitizeRuntime(runtime: BenchmarkOptions["runtime"]): ThumbnailBenchmarkReport["runtime"] {
  return {
    appVersion: runtime?.appVersion ?? "unknown",
    electronVersion: runtime?.electronVersion ?? "unknown",
    chromiumVersion: runtime?.chromiumVersion ?? "unknown"
  };
}

async function runStandardPass(
  models: ModelFile[],
  request: BenchmarkOptions["request"],
  diagnostics: BenchmarkOptions["diagnostics"],
  now: () => number
): Promise<PassResult> {
  const tracker = createPassTracker(now, diagnostics);

  for (let offset = 0; offset < models.length; offset += INITIAL_VISIBLE_COUNT) {
    const batch = models.slice(offset, offset + INITIAL_VISIBLE_COUNT);
    const handles = batch.map((model, index) => request(model, initialPriority(index)));
    try {
      await settleWindow(handles, tracker, offset === 0);
    } finally {
      handles.forEach((handle) => handle.release());
    }
  }

  return tracker.finish();
}

async function runScrollPass(
  models: ModelFile[],
  request: BenchmarkOptions["request"],
  diagnostics: BenchmarkOptions["diagnostics"],
  now: () => number,
  waitForFrame: () => Promise<void>
): Promise<PassResult> {
  const tracker = createPassTracker(now, diagnostics);
  const positions = createScrollPositions(models.length);

  for (let visit = 0; visit < positions.length; visit += 1) {
    await waitForFrame();
    const windowStart = positions[visit];
    const windowEnd = Math.min(models.length, windowStart + INITIAL_VISIBLE_COUNT);
    const nearbyStart = Math.max(0, windowStart - SCROLL_STEP);
    const nearbyEnd = Math.min(models.length, windowEnd + SCROLL_STEP);
    const handles = models.slice(nearbyStart, nearbyEnd).map((model, localIndex) => {
      const index = nearbyStart + localIndex;
      const priority: ThumbnailPriority = index === windowStart
        ? "selected"
        : index >= windowStart && index < windowEnd
          ? "visible"
          : "nearby";
      return request(model, priority);
    });
    try {
      await settleWindow(handles, tracker, visit === 0, windowEnd - windowStart);
    } finally {
      handles.forEach((handle) => handle.release());
    }
  }

  return tracker.finish();
}

function createPassTracker(now: () => number, diagnostics: BenchmarkOptions["diagnostics"]) {
  const startedAt = now();
  let queuePeak = diagnostics().queued.total;
  let firstVisibleThumbnail: number | null = null;
  let initiallyVisibleSettled = 0;

  return {
    startedAt,
    now,
    sampleQueue() {
      queuePeak = Math.max(queuePeak, diagnostics().queued.total);
    },
    recordSuccess() {
      if (firstVisibleThumbnail === null) firstVisibleThumbnail = elapsed(now(), startedAt);
    },
    settleInitial() {
      initiallyVisibleSettled = elapsed(now(), startedAt);
    },
    finish(): PassResult {
      return {
        timingsMs: {
          libraryScanReady: 0,
          firstVisibleThumbnail,
          initiallyVisibleSettled,
          fullReconciliation: elapsed(now(), startedAt)
        },
        queuePeak
      };
    }
  };
}

async function settleWindow(
  handles: ThumbnailBenchmarkRequest[],
  tracker: ReturnType<typeof createPassTracker>,
  initial: boolean,
  initiallyVisibleCount = handles.length
) {
  await Promise.resolve();
  tracker.sampleQueue();
  const promises = handles.map((handle, index) => handle.promise.then((thumbnail) => {
    if (initial && index < initiallyVisibleCount && thumbnail !== null) tracker.recordSuccess();
    return thumbnail;
  }));
  if (promises.length > 0) await Promise.race(promises);
  tracker.sampleQueue();
  if (initial) {
    await Promise.all(promises.slice(0, initiallyVisibleCount));
    tracker.settleInitial();
  }
  await Promise.all(promises);
  tracker.sampleQueue();
}

function createScrollPositions(modelCount: number) {
  if (modelCount === 0) return [];
  const last = Math.max(0, modelCount - INITIAL_VISIBLE_COUNT);
  const downward: number[] = [];
  for (let start = 0; start < last; start += SCROLL_STEP) downward.push(start);
  if (downward.at(-1) !== last) downward.push(last);
  return [...downward, ...downward.slice(0, -1).reverse()];
}

function defaultFrameWait() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function initialPriority(index: number): ThumbnailPriority {
  if (index === 0) return "selected";
  if (index < INITIAL_VISIBLE_COUNT) return "visible";
  return "historical";
}

function countSizeBuckets(models: ModelFile[]) {
  const buckets = { under1MiB: 0, oneToTenMiB: 0, overTenMiB: 0 };
  for (const model of models) {
    if (model.sizeBytes < MEBIBYTE) buckets.under1MiB += 1;
    else if (model.sizeBytes <= 10 * MEBIBYTE) buckets.oneToTenMiB += 1;
    else buckets.overTenMiB += 1;
  }
  return buckets;
}

function sanitizeDiagnostics(snapshot: ThumbnailDiagnosticsSnapshot): ThumbnailDiagnosticsSnapshot {
  return {
    queued: { ...snapshot.queued },
    queuedByStage: { ...snapshot.queuedByStage },
    running: { ...snapshot.running },
    cacheHits: snapshot.cacheHits,
    cacheMisses: snapshot.cacheMisses,
    embeddedHits: snapshot.embeddedHits,
    renders: snapshot.renders,
    failures: snapshot.failures,
    discardedHistorical: snapshot.discardedHistorical,
    longTasks: { ...snapshot.longTasks },
    retainedResults: { ...snapshot.retainedResults },
    durationMs: {
      io: { ...snapshot.durationMs.io },
      render: { ...snapshot.durationMs.render },
      total: { ...snapshot.durationMs.total }
    }
  };
}

function elapsed(current: number, startedAt: number) {
  const value = current - startedAt;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeDuration(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function emptyTimings(): ThumbnailBenchmarkReport["timingsMs"] {
  return {
    libraryScanReady: 0,
    firstVisibleThumbnail: null,
    initiallyVisibleSettled: 0,
    fullReconciliation: 0
  };
}
