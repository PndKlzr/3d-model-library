import { afterEach, describe, expect, it, vi } from "vitest";
import { reconcileThumbnailWarmupProgress, startThumbnailWarmup } from "../../src/lib/thumbnailWarmup";

afterEach(() => vi.useRealTimers());

describe("thumbnail warmup", () => {
  it("reconciles displayed remaining work with foreground completions", () => {
    const ready = new Set(["a", "b", "c"]);
    expect(reconcileThumbnailWarmupProgress(
      { phase: "preparing", remaining: 4, total: 5, failures: 0 },
      ["a", "b", "c", "d", "e"],
      (item) => ready.has(item)
    )).toEqual({ phase: "preparing", remaining: 2, total: 5, failures: 0 });
  });

  it("skips thumbnails already completed by foreground loading", async () => {
    vi.useFakeTimers();
    const ready = new Set(["a", "b"]);
    const progress = vi.fn();
    const request = vi.fn((item: string) => ({
      promise: Promise.resolve(item), release: vi.fn()
    }));
    const queue = startThumbnailWarmup(["a", "b", "c"], request, progress,
      (item) => ready.has(item));

    expect(progress).toHaveBeenLastCalledWith({
      phase: "preparing", remaining: 1, total: 3, failures: 0
    });
    await vi.advanceTimersByTimeAsync(600);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("c", "mosaic");
    expect(progress).toHaveBeenLastCalledWith({
      phase: "complete", remaining: 0, total: 3, failures: 0
    });
    queue.stop();
  });

  it("skips items that become ready while background work waits", async () => {
    vi.useFakeTimers();
    const ready = new Set<string>();
    const progress = vi.fn();
    const request = vi.fn(() => ({ promise: Promise.resolve("image"), release: vi.fn() }));
    const queue = startThumbnailWarmup(["a", "b", "c"], request, progress,
      (item) => ready.has(item));
    ready.add("b");
    ready.add("c");
    await vi.advanceTimersByTimeAsync(600);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("a", "mosaic");
    expect(progress).toHaveBeenLastCalledWith({
      phase: "complete", remaining: 0, total: 3, failures: 0
    });
    queue.stop();
  });

  it("keeps processing one low-priority file at a time", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const request = vi.fn(() => ({ promise: new Promise<void>((resolve) => { finish = resolve; }), release: vi.fn() }));
    const queue = startThumbnailWarmup(["a", "b"], request);
    await vi.advanceTimersByTimeAsync(500);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(99);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("a", "mosaic");
    await vi.advanceTimersByTimeAsync(5000);
    expect(request).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(24);
    expect(request).toHaveBeenCalledTimes(2);
    queue.stop();
  });

  it("reports how many thumbnails remain during quiet and active work", async () => {
    vi.useFakeTimers();
    const progress = vi.fn();
    const request = vi.fn(() => ({ promise: Promise.resolve(), release: vi.fn() }));
    const queue = startThumbnailWarmup(["a", "b"], request, progress);

    expect(progress).toHaveBeenLastCalledWith({ phase: "preparing", remaining: 2, total: 2, failures: 0 });
    await vi.advanceTimersByTimeAsync(600);
    expect(progress).toHaveBeenCalledWith({ phase: "generating", remaining: 2, total: 2, failures: 0 });
    expect(progress).toHaveBeenLastCalledWith({ phase: "preparing", remaining: 1, total: 2, failures: 0 });
    await vi.advanceTimersByTimeAsync(24);
    expect(progress).toHaveBeenLastCalledWith({ phase: "complete", remaining: 0, total: 2, failures: 0 });
    queue.stop();
  });

  it("releases active work and never starts another file after stopping", async () => {
    vi.useFakeTimers();
    const release = vi.fn();
    let finish!: () => void;
    const request = vi.fn(() => ({ promise: new Promise<void>((resolve) => { finish = resolve; }), release }));
    const queue = startThumbnailWarmup([1, 2], request);
    await vi.advanceTimersByTimeAsync(600);
    queue.stop();
    expect(release).toHaveBeenCalledOnce();
    finish();
    await vi.advanceTimersByTimeAsync(5000);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("continues after a failed thumbnail without an unhandled rejection", async () => {
    vi.useFakeTimers();
    const request = vi.fn(() => ({ promise: Promise.reject(new Error("bad model")), release: vi.fn() }));
    const queue = startThumbnailWarmup([1, 2], request);
    await vi.advanceTimersByTimeAsync(624);
    expect(request).toHaveBeenCalledTimes(2);
    queue.stop();
  });

  it("reports files that finish without a thumbnail", async () => {
    vi.useFakeTimers();
    const progress = vi.fn();
    const request = vi.fn(() => ({ promise: Promise.resolve(null), release: vi.fn() }));
    const queue = startThumbnailWarmup([1], request, progress);
    await vi.advanceTimersByTimeAsync(600);
    expect(progress).toHaveBeenLastCalledWith({
      phase: "complete",
      remaining: 0,
      total: 1,
      failures: 1
    });
    queue.stop();
  });
});
