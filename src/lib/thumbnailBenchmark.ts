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
    cachedGridVisible: number;
    firstVisibleThumbnail: number;
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
    ? await runScrollPass(supportedModels, options.request, options.diagnostics, now)
    : await runStandardPass(supportedModels, options.request, options.diagnostics, now);

  return {
    schemaVersion: 1,
    scenario: options.scenario,
    generatedAt: (options.generatedAt ?? (() => new Date().toISOString()))(),
    runtime: sanitizeRuntime(options.runtime),
    modelCount: supportedModels.length,
    sizeBuckets: countSizeBuckets(supportedModels),
    timingsMs: pass.timingsMs,
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
  return runMeasuredPass(
    models,
    () => models.map((model, index) => request(model, initialPriority(index))),
    diagnostics,
    now
  );
}

async function runScrollPass(
  models: ModelFile[],
  request: BenchmarkOptions["request"],
  diagnostics: BenchmarkOptions["diagnostics"],
  now: () => number
): Promise<PassResult> {
  return runMeasuredPass(
    models,
    () => models.map((model) => request(model, "historical")),
    diagnostics,
    now,
    async (handles, sampleQueue) => {
      for (let windowStart = 0; windowStart < models.length; windowStart += SCROLL_STEP) {
        const windowEnd = Math.min(models.length, windowStart + INITIAL_VISIBLE_COUNT);
        const nearbyStart = Math.max(0, windowStart - SCROLL_STEP);
        const nearbyEnd = Math.min(models.length, windowEnd + SCROLL_STEP);

        handles.forEach((handle, index) => {
          const priority: ThumbnailPriority = index === windowStart
            ? "selected"
            : index >= windowStart && index < windowEnd
              ? "visible"
              : index >= nearbyStart && index < nearbyEnd
                ? "nearby"
                : "historical";
          handle.setPriority(priority);
        });
        await Promise.resolve();
        sampleQueue();
      }
    }
  );
}

async function runMeasuredPass(
  models: ModelFile[],
  createHandles: () => ThumbnailBenchmarkRequest[],
  diagnostics: BenchmarkOptions["diagnostics"],
  now: () => number,
  prepare?: (
    handles: ThumbnailBenchmarkRequest[],
    sampleQueue: () => void
  ) => Promise<void>
): Promise<PassResult> {
  const startedAt = now();
  const handles = createHandles();
  let queuePeak = diagnostics().queued.total;
  const sampleQueue = () => {
    queuePeak = Math.max(queuePeak, diagnostics().queued.total);
  };
  const initialHandles = handles.slice(0, Math.min(INITIAL_VISIBLE_COUNT, models.length));

  try {
    await prepare?.(handles, sampleQueue);
    await Promise.resolve();
    sampleQueue();

    if (initialHandles.length === 0) {
      return {
        timingsMs: emptyTimings(),
        queuePeak
      };
    }

    await Promise.race(initialHandles.map((handle) => handle.promise));
    const firstVisibleThumbnail = elapsed(now(), startedAt);
    sampleQueue();

    await Promise.all(initialHandles.map((handle) => handle.promise));
    const initiallyVisibleSettled = elapsed(now(), startedAt);
    sampleQueue();

    await Promise.all(handles.map((handle) => handle.promise));
    const fullReconciliation = elapsed(now(), startedAt);
    sampleQueue();

    return {
      timingsMs: {
        cachedGridVisible: 0,
        firstVisibleThumbnail,
        initiallyVisibleSettled,
        fullReconciliation
      },
      queuePeak
    };
  } finally {
    handles.forEach((handle) => handle.release());
  }
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

function emptyTimings(): ThumbnailBenchmarkReport["timingsMs"] {
  return {
    cachedGridVisible: 0,
    firstVisibleThumbnail: 0,
    initiallyVisibleSettled: 0,
    fullReconciliation: 0
  };
}
