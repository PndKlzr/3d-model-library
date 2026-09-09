export type ThumbnailPriority = "visible" | "nearby" | "background";

export type ThumbnailRequest<T> = {
  promise: Promise<T>;
  setPriority: (priority: ThumbnailPriority) => void;
  release: () => void;
};

type Subscriber = { priority: ThumbnailPriority; released: boolean };

type Job<T> = {
  key: string;
  sequence: number;
  run: () => Promise<T>;
  subscribers: Set<Subscriber>;
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  state: "queued" | "running";
};

const PRIORITY_WEIGHT: Record<ThumbnailPriority, number> = {
  visible: 2,
  nearby: 1,
  background: 0
};

export function createThumbnailScheduler(options: { concurrency?: number } = {}) {
  const concurrency = Math.max(1, options.concurrency ?? 1);
  const jobs = new Map<string, Job<unknown>>();
  const idleWaiters = new Set<() => void>();
  let activeJobs = 0;
  let sequence = 0;
  let runScheduled = false;

  function enqueue<T>(key: string, priority: ThumbnailPriority, run: () => Promise<T>): ThumbnailRequest<T> {
    const subscriber: Subscriber = { priority, released: false };
    let job = jobs.get(key) as Job<T> | undefined;

    if (!job) {
      let resolve!: (value: T) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((resolvePromise, rejectPromise) => {
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
    scheduleRun();

    return {
      promise: job.promise,
      setPriority(nextPriority) {
        if (!subscriber.released) {
          subscriber.priority = nextPriority;
          scheduleRun();
        }
      },
      release() {
        subscriber.released = true;
        subscriber.priority = "background";
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
      void nextJob.run().then(nextJob.resolve, nextJob.reject).finally(() => {
        activeJobs -= 1;
        jobs.delete(nextJob.key);
        runNext();
        resolveIdleWaiters();
      });
    }
    resolveIdleWaiters();
  }

  function selectNextJob() {
    return [...jobs.values()]
      .filter((job) => job.state === "queued")
      .sort((left, right) => getJobPriority(right) - getJobPriority(left) || left.sequence - right.sequence)[0];
  }

  function getJobPriority(job: Job<unknown>) {
    let priority = PRIORITY_WEIGHT.background;
    for (const subscriber of job.subscribers) {
      if (!subscriber.released) priority = Math.max(priority, PRIORITY_WEIGHT[subscriber.priority]);
    }
    return priority;
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

  return { enqueue, onIdle };
}
