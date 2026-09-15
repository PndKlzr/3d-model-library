type WarmupRequest = { promise: Promise<unknown>; release: () => void };
export type ThumbnailWarmupProgress = {
  phase: "preparing" | "generating" | "complete";
  remaining: number;
  total: number;
  failures: number;
};

const INITIAL_WARMUP_DELAY_MS = 600;
const BETWEEN_ITEMS_DELAY_MS = 24;

// Keep background work bounded: one request, followed by a quiet interval.
export function startThumbnailWarmup<T>(
  items: readonly T[],
  request: (item: T, priority: "mosaic") => WarmupRequest,
  onProgress: (progress: ThumbnailWarmupProgress) => void = () => undefined
) {
  let index = 0;
  let stopped = false;
  let active: WarmupRequest | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  function schedule(delayMs = INITIAL_WARMUP_DELAY_MS) {
    clearTimeout(timer);
    if (!stopped && !active && index < items.length) {
      onProgress({
        phase: "preparing",
        remaining: items.length - index,
        total: items.length,
        failures
      });
      timer = setTimeout(run, delayMs);
    }
  }

  async function run() {
    if (stopped) return;
    let current: WarmupRequest | null = null;
    try {
      onProgress({
        phase: "generating",
        remaining: items.length - index,
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
      if (!stopped && index >= items.length) {
        onProgress({ phase: "complete", remaining: 0, total: items.length, failures });
      } else {
        schedule(BETWEEN_ITEMS_DELAY_MS);
      }
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
