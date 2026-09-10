import type { ThumbnailPriority } from "./thumbnailDiagnostics";

export type { ThumbnailPriority } from "./thumbnailDiagnostics";

export type ThumbnailRequest<T> = {
  promise: Promise<T | undefined>;
  setPriority: (priority: ThumbnailPriority) => void;
  release: () => void;
};

export type ThumbnailSchedulerOptions = {
  concurrency?: number;
  maxHistoricalJobs?: number;
  maxCompletedEntries?: number;
  completedTtlMs?: number;
  now?: () => number;
  shouldCacheResult?: (value: unknown) => boolean;
};

export type ThumbnailSchedulerSnapshot = {
  queued: Record<ThumbnailPriority, number>;
  active: number;
  retainedResults: number;
  discardedHistorical: number;
};

type ThumbnailSchedulerListener = (snapshot: ThumbnailSchedulerSnapshot) => void;
type Subscriber = { priority: ThumbnailPriority; released: boolean };

type Job<T> = {
  key: string;
  sequence: number;
  run: () => Promise<T>;
  subscribers: Set<Subscriber>;
  promise: Promise<T | undefined>;
  resolve: (value: T | undefined) => void;
  reject: (reason?: unknown) => void;
  state: "queued" | "running" | "completed" | "discarded";
  completedAt?: number;
};

const PRIORITY_WEIGHT: Record<ThumbnailPriority, number> = {
  selected: 4,
  visible: 3,
  nearby: 2,
  mosaic: 1,
  historical: 0
};

export function createThumbnailScheduler(options: ThumbnailSchedulerOptions = {}) {
  const concurrency = Math.max(1, Math.trunc(options.concurrency ?? 1));
  const maxHistoricalJobs = normalizeLimit(options.maxHistoricalJobs, 32);
  const maxCompletedEntries = normalizeLimit(options.maxCompletedEntries, 8);
  const completedTtlMs = Math.max(0, options.completedTtlMs ?? 5_000);
  const now = options.now ?? (() => Date.now());
  const shouldCacheResult = options.shouldCacheResult ?? (() => true);
  const jobs = new Map<string, Job<unknown>>();
  const listeners = new Set<ThumbnailSchedulerListener>();
  const idleWaiters = new Set<() => void>();
  let activeJobs = 0;
  let discardedHistorical = 0;
  let sequence = 0;
  let runScheduled = false;

  function enqueue<T>(
    key: string,
    priority: ThumbnailPriority,
    run: () => Promise<T>
  ): ThumbnailRequest<T> {
    pruneCompleted();
    const subscriber: Subscriber = { priority, released: false };
    let job = jobs.get(key) as Job<T> | undefined;

    if (job?.state === "completed") {
      return {
        promise: job.promise,
        setPriority() {},
        release() {}
      };
    }

    if (!job) {
      let resolve!: (value: T | undefined) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T | undefined>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });

      job = {
        key,
        sequence: sequence++,
        run,
        subscribers: new Set(),
        promise,
        resolve,
        reject,
        state: "queued"
      };
      jobs.set(key, job as Job<unknown>);
    }

    job.subscribers.add(subscriber);
    boundHistoricalJobs();
    publishSnapshot();
    if (job.state !== "discarded") scheduleRun();

    return {
      promise: job.promise,
      setPriority(nextPriority) {
        if (job.state === "discarded" || subscriber.released || subscriber.priority === nextPriority) return;
        subscriber.priority = nextPriority;
        boundHistoricalJobs();
        publishSnapshot();
        scheduleRun();
      },
      release() {
        if (job.state === "discarded" || subscriber.released) return;
        subscriber.released = true;
        subscriber.priority = "historical";
        boundHistoricalJobs();
        publishSnapshot();
        scheduleRun();
      }
    };
  }

  function scheduleRun() {
    if (runScheduled) return;
    runScheduled = true;
    queueMicrotask(() => {
      runScheduled = false;
      runNext();
    });
  }

  function runNext() {
    while (activeJobs < concurrency) {
      const nextJob = selectNextJob();
      if (!nextJob) break;

      nextJob.state = "running";
      activeJobs += 1;
      publishSnapshot();
      void Promise.resolve()
        .then(() => nextJob.run())
        .then(
          (value) => completeJob(nextJob, value),
          (reason) => failJob(nextJob, reason)
        );
    }
    resolveIdleWaiters();
  }

  function completeJob(job: Job<unknown>, value: unknown) {
    activeJobs -= 1;
    job.state = "completed";
    job.subscribers.clear();
    if (shouldCacheResult(value)) {
      job.completedAt = now();
    } else {
      jobs.delete(job.key);
    }
    job.resolve(value);
    pruneCompleted(false);
    publishSnapshot();
    runNext();
    resolveIdleWaiters();
  }

  function failJob(job: Job<unknown>, reason: unknown) {
    activeJobs -= 1;
    job.state = "completed";
    job.subscribers.clear();
    jobs.delete(job.key);
    job.reject(reason);
    publishSnapshot();
    runNext();
    resolveIdleWaiters();
  }

  function selectNextJob() {
    return [...jobs.values()]
      .filter((job) => job.state === "queued")
      .sort((left, right) => getJobPriority(right) - getJobPriority(left) || left.sequence - right.sequence)[0];
  }

  function getJobPriority(job: Job<unknown>) {
    let priority = PRIORITY_WEIGHT.historical;
    for (const subscriber of job.subscribers) {
      if (!subscriber.released) priority = Math.max(priority, PRIORITY_WEIGHT[subscriber.priority]);
    }
    return priority;
  }

  function boundHistoricalJobs() {
    const historicalJobs = [...jobs.values()]
      .filter((job) => job.state === "queued" && getJobPriority(job) === PRIORITY_WEIGHT.historical)
      .sort((left, right) => left.sequence - right.sequence);
    const excess = historicalJobs.length - maxHistoricalJobs;
    if (excess <= 0) return;

    for (const job of historicalJobs.slice(0, excess)) {
      job.state = "discarded";
      jobs.delete(job.key);
      job.subscribers.clear();
      job.resolve(undefined);
      discardedHistorical += 1;
    }
    resolveIdleWaiters();
  }

  function pruneCompleted(notify = true) {
    const currentTime = now();
    const completedJobs = [...jobs.values()]
      .filter((job) => job.state === "completed")
      .sort((left, right) => (left.completedAt ?? 0) - (right.completedAt ?? 0) || left.sequence - right.sequence);
    const expired = completedJobs.filter(
      (job) => currentTime - (job.completedAt ?? currentTime) >= completedTtlMs
    );
    const retained = completedJobs.filter((job) => !expired.includes(job));
    const overLimit = retained.slice(0, Math.max(0, retained.length - maxCompletedEntries));
    const removed = new Set([...expired, ...overLimit]);

    for (const job of removed) jobs.delete(job.key);
    if (notify && removed.size > 0) publishSnapshot();
  }

  function clearCompleted(key?: string) {
    let changed = false;
    if (key !== undefined) {
      const job = jobs.get(key);
      if (job?.state === "completed") {
        jobs.delete(key);
        changed = true;
      }
    } else {
      for (const [jobKey, job] of jobs) {
        if (job.state !== "completed") continue;
        jobs.delete(jobKey);
        changed = true;
      }
    }
    if (changed) publishSnapshot();
  }

  function resetMetrics() {
    if (activeJobs > 0 || [...jobs.values()].some((job) => job.state === "queued")) {
      throw new Error("Cannot reset thumbnail scheduler while work is active");
    }
    clearCompleted();
    discardedHistorical = 0;
    publishSnapshot();
  }

  function createSnapshot(): ThumbnailSchedulerSnapshot {
    const queued: Record<ThumbnailPriority, number> = {
      selected: 0,
      visible: 0,
      nearby: 0,
      mosaic: 0,
      historical: 0
    };
    let retainedResults = 0;
    for (const job of jobs.values()) {
      if (job.state === "queued") {
        queued[getPriorityName(job)] += 1;
      } else if (job.state === "completed") {
        retainedResults += 1;
      }
    }
    return { queued, active: activeJobs, retainedResults, discardedHistorical };
  }

  function getPriorityName(job: Job<unknown>): ThumbnailPriority {
    let result: ThumbnailPriority = "historical";
    for (const subscriber of job.subscribers) {
      if (!subscriber.released && PRIORITY_WEIGHT[subscriber.priority] > PRIORITY_WEIGHT[result]) {
        result = subscriber.priority;
      }
    }
    return result;
  }

  function publishSnapshot() {
    if (listeners.size === 0) return;
    const snapshot = createSnapshot();
    for (const listener of listeners) deliverSnapshot(listener, snapshot);
  }

  function getSnapshot() {
    pruneCompleted();
    return createSnapshot();
  }

  function subscribe(listener: ThumbnailSchedulerListener) {
    pruneCompleted();
    listeners.add(listener);
    if (!deliverSnapshot(listener, createSnapshot())) listeners.delete(listener);
    return () => listeners.delete(listener);
  }

  function deliverSnapshot(
    listener: ThumbnailSchedulerListener,
    snapshot: ThumbnailSchedulerSnapshot
  ) {
    try {
      listener(structuredClone(snapshot));
      return true;
    } catch {
      return false;
    }
  }

  function resolveIdleWaiters() {
    if (activeJobs > 0 || [...jobs.values()].some((job) => job.state === "queued")) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  }

  function onIdle() {
    if (activeJobs === 0 && ![...jobs.values()].some((job) => job.state === "queued")) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => idleWaiters.add(resolve));
  }

  return { enqueue, getSnapshot, subscribe, clearCompleted, resetMetrics, pruneCompleted, onIdle };
}

function normalizeLimit(value: number | undefined, fallback: number) {
  return Math.max(0, Math.trunc(value ?? fallback));
}
