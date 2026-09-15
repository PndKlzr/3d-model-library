type WarmupRequest = { promise: Promise<unknown>; release: () => void };
export type ThumbnailWarmupProgress = {
  phase: "preparing" | "generating" | "complete";
  remaining: number;
  total: number;
  failures: number;
};

const INITIAL_WARMUP_DELAY_MS = 600;
const BETWEEN_ITEMS_DELAY_MS = 24;

export function reconcileThumbnailWarmupProgress<T>(
  progress: ThumbnailWarmupProgress,
  items: readonly T[],
  isReady: (item: T) => boolean
): ThumbnailWarmupProgress {
  if (progress.phase === "complete") return progress;
  let unready = 0;
  for (const item of items) {
    if (!isReady(item)) unready += 1;
  }
  return { ...progress, remaining: Math.min(progress.remaining, unready) };
}

// Keep background work bounded: one request, followed by a quiet interval.
export function startThumbnailWarmup<T>(
  items: readonly T[],
  request: (item: T, priority: "mosaic") => WarmupRequest,
  onProgress: (progress: ThumbnailWarmupProgress) => void = () => undefined,
  isReady: (item: T) => boolean = () => false
) {
  let index = 0;
  let stopped = false;
  let active: WarmupRequest | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  function skipReadyItems() {
    while (index < items.length && isReady(items[index])) index += 1;
  }

  function remaining() {
    let count = 0;
    for (let next = index; next < items.length; next += 1) {
      if (!isReady(items[next])) count += 1;
    }
    return count;
  }

  function schedule(delayMs = INITIAL_WARMUP_DELAY_MS) {
    clearTimeout(timer);
    if (stopped || active) return;
    skipReadyItems();
    if (index < items.length) {
      onProgress({
        phase: "preparing",
        remaining: remaining(),
        total: items.length,
        failures
      });
      timer = setTimeout(run, delayMs);
    } else {
      onProgress({ phase: "complete", remaining: 0, total: items.length, failures });
    }
  }

  async function run() {
    if (stopped) return;
    skipReadyItems();
    if (index >= items.length) {
      onProgress({ phase: "complete", remaining: 0, total: items.length, failures });
      return;
    }
    let current: WarmupRequest | null = null;
    try {
      onProgress({
        phase: "generating",
        remaining: remaining(),
        total: items.length,
        failures
      });
      current = request(items[index++], "mosaic");
      active = current;
      if (await current.promise === null) failures += 1;
    } catch {
      failures += 1;
      // A damaged file must not stop the remaining thumbnails.
    } finally {
      if (!stopped) current?.release();
      active = null;
      schedule(BETWEEN_ITEMS_DELAY_MS);
    }
  }

  schedule();
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      active?.release();
    }
  };
}
