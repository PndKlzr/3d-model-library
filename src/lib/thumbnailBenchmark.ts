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
  schemaVersion: 2;
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
    cachedIndexReady: number;
    cachedGridVisible: number;
    libraryReconciliationSettled: number;
    firstVisibleThumbnail: number | null;
    initiallyVisibleSettled: number;
    thumbnailPassSettled: number;
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
  cachedGridVisibleMs?: number;
  libraryReconciliationSettledMs?: number;
  waitForFrame?: () => Promise<void>;
};

type PassResult = {
  timingsMs: Pick<
    ThumbnailBenchmarkReport["timingsMs"],
    "firstVisibleThumbnail" | "initiallyVisibleSettled" | "thumbnailPassSettled"
  >;
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
    (model) => model.extension === ".stl" ||
      model.extension === ".3mf" ||
      model.extension === ".obj"
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
    schemaVersion: 2,
    scenario: options.scenario,
    generatedAt: (options.generatedAt ?? (() => new Date().toISOString()))(),
    runtime: sanitizeRuntime(options.runtime),
    modelCount: supportedModels.length,
    sizeBuckets: countSizeBuckets(supportedModels),
    timingsMs: {
      ...pass.timingsMs,
      cachedIndexReady: normalizeDuration(options.libraryScanReadyMs ?? 0),
      cachedGridVisible: normalizeDuration(options.cachedGridVisibleMs ?? 0),
      libraryReconciliationSettled: normalizeDuration(
        options.libraryReconciliationSettledMs ?? options.libraryScanReadyMs ?? 0
      )
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
  const liveHandles = new Map<number, {
    handle: ThumbnailBenchmarkRequest;
    priority: ThumbnailPriority;
  }>();
  const allPromises: Promise<string | null>[] = [];
  let initialSettlement: Promise<void> = Promise.resolve();

  try {
    for (let visit = 0; visit < positions.length; visit += 1) {
      await waitForFrame();
      const windowStart = positions[visit];
      const windowEnd = Math.min(models.length, windowStart + INITIAL_VISIBLE_COUNT);
      const nearbyStart = Math.max(0, windowStart - SCROLL_STEP);
      const nearbyEnd = Math.min(models.length, windowEnd + SCROLL_STEP);
      const desiredPriorities = new Map<number, ThumbnailPriority>();

      for (let index = nearbyStart; index < nearbyEnd; index += 1) {
        desiredPriorities.set(index, index === windowStart
          ? "selected"
          : index >= windowStart && index < windowEnd
            ? "visible"
            : "nearby");
      }

      for (const [index, live] of liveHandles) {
        if (desiredPriorities.has(index)) continue;
        live.handle.release();
        liveHandles.delete(index);
      }

      const initiallyVisiblePromises: Promise<string | null>[] = [];
      for (const [index, priority] of desiredPriorities) {
        const live = liveHandles.get(index);
        if (live) {
          if (live.priority !== priority) {
            live.handle.setPriority(priority);
            live.priority = priority;
          }
          continue;
        }

        const handle = request(models[index], priority);
        liveHandles.set(index, { handle, priority });
        allPromises.push(handle.promise);
        if (visit === 0 && index >= windowStart && index < windowEnd) {
          initiallyVisiblePromises.push(handle.promise.then((thumbnail) => {
            if (thumbnail !== null) tracker.recordSuccess();
            return thumbnail;
          }));
        }
      }

      if (visit === 0) {
        initialSettlement = Promise.all(initiallyVisiblePromises).then(() => {
          tracker.settleInitial();
        });
      }

      await Promise.resolve();
      tracker.sampleQueue();
    }

    await Promise.all([initialSettlement, Promise.all(allPromises)]);
    tracker.sampleQueue();
  } finally {
    for (const live of liveHandles.values()) live.handle.release();
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
          firstVisibleThumbnail,
          initiallyVisibleSettled,
          thumbnailPassSettled: elapsed(now(), startedAt)
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
    failuresByExtension: { ...snapshot.failuresByExtension },
    discardedHistorical: snapshot.discardedHistorical,
    longTasks: { ...snapshot.longTasks },
    retainedResults: { ...snapshot.retainedResults },
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

function elapsed(current: number, startedAt: number) {
  const value = current - startedAt;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeDuration(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
