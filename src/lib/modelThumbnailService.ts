import { createThumbnailDiagnostics, type ThumbnailDiagnosticsSnapshot } from "./thumbnailDiagnostics";
import {
  createThumbnailScheduler,
  type ThumbnailPriority,
  type ThumbnailRequest
} from "./thumbnailScheduler";
import { renderThumbnail } from "./thumbnailRenderer";
import { yieldBeforeThumbnailRender } from "./thumbnailFrameGate";
import { THUMBNAIL_RENDER_VERSION } from "../shared/thumbnailVersion";
import type { LibrarySessionRef, ModelFile } from "../shared/types";
import { isArchive, isDirectImage } from "../shared/fileCapabilities";
import { compactImageThumbnail } from "./imageThumbnail";

export type { ThumbnailPriority } from "./thumbnailScheduler";

export type ModelThumbnailServiceDependencies = {
  readCachedThumbnail: (model: ModelFile) => Promise<string | null>;
  readEmbeddedThumbnail: (absolutePath: string) => Promise<string | null>;
  readImageDataUrl: (session: LibrarySessionRef, absolutePath: string) => Promise<string>;
  readObjPreviewFile: (session: LibrarySessionRef, absolutePath: string) => Promise<ArrayBuffer>;
  readModelFile: (absolutePath: string) => Promise<ArrayBuffer>;
  writeCachedThumbnail: (
    model: ModelFile,
    dataUrl: string,
    sessionKey: string
  ) => Promise<void>;
  renderThumbnail: typeof renderThumbnail;
  compactImageThumbnail: typeof compactImageThumbnail;
  yieldBeforeRender: () => Promise<void>;
};

export type ModelThumbnailService = {
  beginLibrarySession: (session: LibrarySessionRef) => void;
  request: (model: ModelFile, priority: ThumbnailPriority) => ModelThumbnailRequest;
  retry: (model: ModelFile) => void;
  subscribe: (listener: (snapshot: ThumbnailDiagnosticsSnapshot) => void) => () => void;
  getDiagnostics: () => ThumbnailDiagnosticsSnapshot;
  resetDiagnostics: () => void;
  recordLongTask: (durationMs: number) => void;
  onIdle: () => Promise<void>;
};

export type ModelThumbnailRequest = {
  promise: Promise<string | null>;
  setPriority: (priority: ThumbnailPriority) => void;
  release: () => void;
};

type PipelineSubscriber = { priority: ThumbnailPriority; released: boolean };
type PipelineEntry = {
  key: string;
  sessionKey: string;
  session: LibrarySessionRef;
  model: ModelFile;
  promise: Promise<string | null>;
  resolve: (thumbnail: string | null) => void;
  subscribers: Set<PipelineSubscriber>;
  stageRequest: ThumbnailRequest<unknown> | null;
  requestOperation: { settled: () => void };
  invalidated: boolean;
};

type ThumbnailLookup =
  | { kind: "cache"; thumbnail: string }
  | { kind: "embedded"; thumbnail: string }
  | { kind: "direct"; thumbnail: string }
  | { kind: "render" };

const PRIORITY_WEIGHT: Record<ThumbnailPriority, number> = {
  selected: 4,
  visible: 3,
  nearby: 2,
  mosaic: 1,
  historical: 0
};

export function createModelThumbnailService(
  dependencies: ModelThumbnailServiceDependencies
): ModelThumbnailService {
  const diagnostics = createThumbnailDiagnostics();
  const ioScheduler = createThumbnailScheduler({
    concurrency: 4,
    shouldCacheResult: () => false
  });
  const renderScheduler = createThumbnailScheduler({
    concurrency: 1,
    shouldCacheResult: (thumbnail) => typeof thumbnail === "string"
  });
  const pipelineEntries = new Map<string, PipelineEntry>();
  const failedSignatures = new Set<string>();
  const listeners = new Set<(snapshot: ThumbnailDiagnosticsSnapshot) => void>();
  let peakRetainedResults = 0;
  let currentSession = createUnboundSession();
  let currentSessionKey = createSessionKey(currentSession);

  diagnostics.subscribe(publishDiagnostics);
  ioScheduler.subscribe(publishDiagnostics);
  renderScheduler.subscribe(publishDiagnostics);

  function beginLibrarySession(session: LibrarySessionRef) {
    const sessionKey = createSessionKey(session);
    if (sessionKey === currentSessionKey) return;
    currentSession = structuredClone(session);
    currentSessionKey = sessionKey;
    failedSignatures.clear();
    renderScheduler.clearCompleted();

    for (const entry of pipelineEntries.values()) {
      entry.invalidated = true;
      entry.stageRequest?.release();
      entry.resolve(null);
    }
    pipelineEntries.clear();
    peakRetainedResults = 0;
    diagnostics.reset();
    publishDiagnostics();
  }

  function request(model: ModelFile, priority: ThumbnailPriority): ModelThumbnailRequest {
    if (isArchive(model.extension)) return resolvedRequest();

    const key = `${currentSessionKey}:${createIdentity(model)}`;
    if (failedSignatures.has(key)) return resolvedRequest();

    let entry = pipelineEntries.get(key);
    if (!entry) {
      entry = createPipelineEntry(key, model);
      pipelineEntries.set(key, entry);
      queueMicrotask(() => void executePipeline(entry!));
    }

    const subscriber: PipelineSubscriber = { priority, released: false };
    entry.subscribers.add(subscriber);
    updateStagePriority(entry);

    return {
      promise: entry.promise,
      setPriority(nextPriority) {
        if (subscriber.released || subscriber.priority === nextPriority) return;
        subscriber.priority = nextPriority;
        updateStagePriority(entry!);
      },
      release() {
        if (subscriber.released) return;
        subscriber.released = true;
        updateStagePriority(entry!);
      }
    };
  }

  function createPipelineEntry(key: string, model: ModelFile): PipelineEntry {
    let resolve!: (thumbnail: string | null) => void;
    const promise = new Promise<string | null>((resolvePromise) => {
      resolve = resolvePromise;
    });
    return {
      key,
      sessionKey: currentSessionKey,
      session: structuredClone(currentSession),
      model,
      promise,
      resolve,
      subscribers: new Set(),
      stageRequest: null,
      requestOperation: diagnostics.startRequest(),
      invalidated: false
    };
  }

  async function executePipeline(entry: PipelineEntry) {
    let thumbnail: string | null = null;
    try {
      if (!isEntryCurrent(entry)) return;
      const lookup = await runIoStage(entry, `read:${entry.key}`, async () => {
        if (!isEntryCurrent(entry)) return { kind: "render" } as const;
        const cached = await dependencies.readCachedThumbnail(entry.model);
        if (cached) return { kind: "cache", thumbnail: cached } as const;
        diagnostics.recordCacheMiss();

        if (isDirectImage(entry.model.extension)) {
          const direct = await dependencies.readImageDataUrl(entry.session, entry.model.absolutePath);
          return { kind: "direct", thumbnail: await dependencies.compactImageThumbnail(direct) } as const;
        }

        if (entry.model.extension === ".3mf") {
          const embedded = await dependencies.readEmbeddedThumbnail(entry.model.absolutePath);
          if (embedded) return {
            kind: "embedded",
            thumbnail: await dependencies.compactImageThumbnail(embedded)
          } as const;
        }

        return { kind: "render" } as const;
      }, (result) => result.kind === "cache" || result.kind === "embedded"
        ? result.kind
        : undefined);

      if (!lookup || !isEntryCurrent(entry)) return;
      if (lookup.kind === "cache") {
        thumbnail = lookup.thumbnail;
        return;
      }

      thumbnail = lookup.kind === "render"
        ? await runRenderStage(entry)
        : lookup.thumbnail;
      if (!thumbnail || !isEntryCurrent(entry)) return;

      try {
        await runIoStage(entry, `write:${entry.key}`, async () => {
          if (!isEntryCurrent(entry)) return;
          await dependencies.writeCachedThumbnail(entry.model, thumbnail!, entry.sessionKey);
        }, () => undefined, false);
      } catch {
        // The generated image remains usable even when its disk-cache write fails.
      }
    } catch {
      if (isEntryCurrent(entry)) failedSignatures.add(entry.key);
    } finally {
      entry.stageRequest = null;
      if (pipelineEntries.get(entry.key) === entry) pipelineEntries.delete(entry.key);
      entry.requestOperation.settled();
      entry.resolve(isEntryCurrent(entry) ? thumbnail ?? null : null);
      publishDiagnostics();
    }
  }

  async function runIoStage<T>(
    entry: PipelineEntry,
    schedulerKey: string,
    run: () => Promise<T>,
    source: (result: T) => "cache" | "embedded" | undefined,
    countFailure = true
  ): Promise<T | undefined> {
    const operation = diagnostics.start("io", getEffectivePriority(entry), entry.model.extension);
    const stageRequest = ioScheduler.enqueue(schedulerKey, getEffectivePriority(entry), async () => {
      operation.running();
      return run();
    });
    entry.stageRequest = stageRequest as ThumbnailRequest<unknown>;
    try {
      const result = await stageRequest.promise;
      operation.succeeded(result === undefined ? undefined : source(result));
      return result;
    } catch (error) {
      if (countFailure) operation.failed();
      else operation.succeeded();
      throw error;
    }
  }

  async function runRenderStage(entry: PipelineEntry) {
    const operation = diagnostics.start("render", getEffectivePriority(entry), entry.model.extension);
    const stageRequest = renderScheduler.enqueue(
      `render:${entry.key}`,
      getEffectivePriority(entry),
      async () => {
        operation.running();
        if (!isEntryCurrent(entry)) return undefined;
        await dependencies.yieldBeforeRender();
        if (!isEntryCurrent(entry)) return undefined;
        const modelBytes = entry.model.extension === ".obj"
          ? await dependencies.readObjPreviewFile(entry.session, entry.model.absolutePath)
          : await dependencies.readModelFile(entry.model.absolutePath);
        if (!isEntryCurrent(entry)) return undefined;
        const thumbnail = dependencies.renderThumbnail(entry.model.extension, modelBytes);
        return isEntryCurrent(entry) ? thumbnail : undefined;
      }
    );
    entry.stageRequest = stageRequest;
    try {
      const thumbnail = await stageRequest.promise;
      operation.succeeded(thumbnail === undefined ? undefined : "render");
      return thumbnail ?? null;
    } catch (error) {
      operation.failed();
      throw error;
    }
  }

  function retry(model: ModelFile) {
    const key = `${currentSessionKey}:${createIdentity(model)}`;
    failedSignatures.delete(key);
    renderScheduler.clearCompleted(`render:${key}`);
  }

  function subscribe(listener: (snapshot: ThumbnailDiagnosticsSnapshot) => void) {
    listeners.add(listener);
    if (!deliverDiagnostics(listener, getDiagnostics())) listeners.delete(listener);
    return () => listeners.delete(listener);
  }

  function getDiagnostics(): ThumbnailDiagnosticsSnapshot {
    const snapshot = diagnostics.getSnapshot();
    const io = ioScheduler.getSnapshot();
    const render = renderScheduler.getSnapshot();
    for (const priority of Object.keys(io.queued) as ThumbnailPriority[]) {
      snapshot.queued[priority] = io.queued[priority] + render.queued[priority];
    }
    snapshot.queued.total = Object.values(io.queued).reduce(sum, 0) +
      Object.values(render.queued).reduce(sum, 0);
    snapshot.queuedByStage.io = Object.values(io.queued).reduce(sum, 0);
    snapshot.queuedByStage.render = Object.values(render.queued).reduce(sum, 0);
    snapshot.queuedByStage.total = snapshot.queuedByStage.io + snapshot.queuedByStage.render;
    snapshot.running.io = io.active;
    snapshot.running.render = render.active;
    snapshot.running.total = io.active + render.active;
    snapshot.discardedHistorical = io.discardedHistorical + render.discardedHistorical;
    snapshot.retainedResults.current = io.retainedResults + render.retainedResults;
    peakRetainedResults = Math.max(peakRetainedResults, snapshot.retainedResults.current);
    snapshot.retainedResults.peak = peakRetainedResults;
    return snapshot;
  }

  function publishDiagnostics() {
    if (listeners.size === 0) return;
    const snapshot = getDiagnostics();
    for (const listener of listeners) deliverDiagnostics(listener, snapshot);
  }

  function resetDiagnostics() {
    ioScheduler.resetMetrics();
    renderScheduler.resetMetrics();
    failedSignatures.clear();
    peakRetainedResults = 0;
    diagnostics.reset();
    publishDiagnostics();
  }

  async function onIdle() {
    while (pipelineEntries.size > 0) {
      await Promise.all([...pipelineEntries.values()].map((entry) => entry.promise));
    }
    await Promise.all([ioScheduler.onIdle(), renderScheduler.onIdle()]);
  }

  return {
    beginLibrarySession,
    request,
    retry,
    subscribe,
    getDiagnostics,
    resetDiagnostics,
    recordLongTask: diagnostics.recordLongTask,
    onIdle
  };

  function isEntryCurrent(entry: PipelineEntry) {
    return !entry.invalidated && entry.sessionKey === currentSessionKey;
  }
}

function createIdentity(model: ModelFile) {
  return `${THUMBNAIL_RENDER_VERSION}:${model.absolutePath}:${model.modifiedAt}:${model.sizeBytes}`;
}

function getEffectivePriority(entry: PipelineEntry): ThumbnailPriority {
  let effective: ThumbnailPriority = "historical";
  for (const subscriber of entry.subscribers) {
    if (!subscriber.released && PRIORITY_WEIGHT[subscriber.priority] > PRIORITY_WEIGHT[effective]) {
      effective = subscriber.priority;
    }
  }
  return effective;
}

function updateStagePriority(entry: PipelineEntry) {
  entry.stageRequest?.setPriority(getEffectivePriority(entry));
}

function resolvedRequest(): ModelThumbnailRequest {
  return {
    promise: Promise.resolve(null),
    setPriority() {},
    release() {}
  };
}

function deliverDiagnostics(
  listener: (snapshot: ThumbnailDiagnosticsSnapshot) => void,
  snapshot: ThumbnailDiagnosticsSnapshot
) {
  try {
    listener(structuredClone(snapshot));
    return true;
  } catch {
    return false;
  }
}

function sum(total: number, value: number) {
  return total + value;
}

export const modelThumbnailService = createModelThumbnailService({
  readCachedThumbnail: (model) => window.modelLibrary.readCachedThumbnail(model),
  readEmbeddedThumbnail: (absolutePath) => window.modelLibrary.readModelThumbnail(absolutePath),
  readImageDataUrl: (session, absolutePath) =>
    window.modelLibrary.readImageDataUrl(session, absolutePath),
  readObjPreviewFile: (session, absolutePath) =>
    window.modelLibrary.readObjPreviewFile(session, absolutePath),
  readModelFile: (absolutePath) => window.modelLibrary.readModelFile(absolutePath),
  writeCachedThumbnail: (model, dataUrl, sessionKey) =>
    window.modelLibrary.writeCachedThumbnail(model, dataUrl, sessionKey),
  renderThumbnail,
  compactImageThumbnail,
  yieldBeforeRender: yieldBeforeThumbnailRender
});

function createSessionKey(session: LibrarySessionRef): string {
  return `${session.libraryId}:${session.generation}:${session.rootPath}`;
}

function createUnboundSession(): LibrarySessionRef {
  return { libraryId: "unbound", generation: 0, rootPath: "C:\\" };
}
