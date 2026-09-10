import { describe, expect, it } from "vitest";
import { createThumbnailScheduler } from "../../src/lib/thumbnailScheduler";

describe("thumbnailScheduler", () => {
  it("lets visible work overtake queued historical work", async () => {
    const order: string[] = [];
    const scheduler = createThumbnailScheduler({ concurrency: 1 });

    scheduler.enqueue("active", "visible", job("active", order));
    scheduler.enqueue("old", "historical", job("old", order));
    scheduler.enqueue("current", "visible", job("current", order));
    await scheduler.onIdle();

    expect(order).toEqual(["active", "current", "old"]);
  });

  it("deduplicates jobs while preserving subscriber priority", async () => {
    const order: string[] = [];
    const scheduler = createThumbnailScheduler({ concurrency: 1 });
    const first = scheduler.enqueue("same", "historical", job("same", order));
    const second = scheduler.enqueue("same", "visible", job("duplicate", order));

    second.setPriority("visible");
    expect(await first.promise).toBe("same");
    expect(await second.promise).toBe("same");
    expect(order).toEqual(["same"]);
  });

  it("demotes released queued subscriptions without cancelling started work", async () => {
    const order: string[] = [];
    const scheduler = createThumbnailScheduler({ concurrency: 1 });
    const active = scheduler.enqueue("active", "visible", async () => {
      order.push("active");
      await Promise.resolve();
      return "active";
    });
    const released = scheduler.enqueue("released", "visible", job("released", order));
    released.release();
    scheduler.enqueue("current", "nearby", job("current", order));

    await active.promise;
    await scheduler.onIdle();

    expect(order).toEqual(["active", "current", "released"]);
  });

  it("retries completed results rejected by the cache policy", async () => {
    const scheduler = createThumbnailScheduler({
      concurrency: 1,
      shouldCacheResult: (value) => value !== null
    });
    let attempts = 0;
    const first = scheduler.enqueue("broken", "visible", async () => {
      attempts += 1;
      return null;
    });

    await expect(first.promise).resolves.toBeNull();
    const second = scheduler.enqueue("broken", "visible", async () => {
      attempts += 1;
      return "recovered";
    });

    await expect(second.promise).resolves.toBe("recovered");
    expect(attempts).toBe(2);
  });

  it("orders selected, visible, nearby, mosaic, then historical work", async () => {
    const order: string[] = [];
    const deferred = createDeferredJobs();
    const scheduler = createThumbnailScheduler({ concurrency: 1 });

    scheduler.enqueue("block", "selected", deferred.job("block", order));
    scheduler.enqueue("historical", "historical", job("historical", order));
    scheduler.enqueue("mosaic", "mosaic", job("mosaic", order));
    scheduler.enqueue("nearby", "nearby", job("nearby", order));
    scheduler.enqueue("visible", "visible", job("visible", order));
    scheduler.enqueue("selected", "selected", job("selected", order));
    deferred.release("block");

    await scheduler.onIdle();

    expect(order).toEqual(["block", "selected", "visible", "nearby", "mosaic", "historical"]);
  });

  it("bounds unstarted historical jobs", async () => {
    const controlled = createControlledJob();
    const scheduler = createThumbnailScheduler({ concurrency: 1, maxHistoricalJobs: 2 });
    const active = scheduler.enqueue("active", "historical", controlled.job);
    await controlled.started;

    const first = scheduler.enqueue("old-1", "historical", job("old-1", []));
    scheduler.enqueue("old-2", "historical", job("old-2", []));
    scheduler.enqueue("old-3", "historical", job("old-3", []));

    await expect(first.promise).resolves.toBeUndefined();
    expect(scheduler.getSnapshot().discardedHistorical).toBe(1);
    controlled.finish();
    await expect(active.promise).resolves.toBe("active");
    await scheduler.onIdle();
  });

  it("expires completed handoff results and reports retained bounds", async () => {
    let now = 0;
    const scheduler = createThumbnailScheduler({
      concurrency: 1,
      completedTtlMs: 100,
      maxCompletedEntries: 2,
      now: () => now
    });

    await scheduler.enqueue("one", "visible", async () => "one").promise;
    await scheduler.enqueue("two", "visible", async () => "two").promise;
    await scheduler.enqueue("three", "visible", async () => "three").promise;
    expect(scheduler.getSnapshot().retainedResults).toBe(2);

    now = 101;
    scheduler.pruneCompleted();

    expect(scheduler.getSnapshot().retainedResults).toBe(0);
  });

  it("publishes snapshots after state changes and supports clearing retained results", async () => {
    const scheduler = createThumbnailScheduler({ concurrency: 1 });
    const snapshots: ReturnType<typeof scheduler.getSnapshot>[] = [];
    const unsubscribe = scheduler.subscribe((snapshot) => snapshots.push(snapshot));

    await scheduler.enqueue("done", "visible", async () => "done").promise;
    await scheduler.onIdle();
    scheduler.clearCompleted("done");
    unsubscribe();

    expect(snapshots[0]).toEqual({
      queued: { selected: 0, visible: 0, nearby: 0, mosaic: 0, historical: 0 },
      active: 0,
      retainedResults: 0,
      discardedHistorical: 0
    });
    expect(snapshots.some((snapshot) => snapshot.queued.visible === 1)).toBe(true);
    expect(snapshots.some((snapshot) => snapshot.active === 1)).toBe(true);
    expect(snapshots.at(-1)?.retainedResults).toBe(0);
  });

  it("isolates listener exceptions while jobs continue to completion", async () => {
    const scheduler = createThumbnailScheduler({ concurrency: 1 });
    const observedActiveCounts: number[] = [];
    let throwingCalls = 0;
    scheduler.subscribe(() => {
      throwingCalls += 1;
      if (throwingCalls > 1) throw new Error("listener failed");
    });
    scheduler.subscribe((snapshot) => observedActiveCounts.push(snapshot.active));

    const request = scheduler.enqueue("job", "visible", async () => "done");

    await expect(request.promise).resolves.toBe("done");
    await expect(scheduler.onIdle()).resolves.toBeUndefined();
    expect(observedActiveCounts).toContain(1);
    expect(observedActiveCounts.at(-1)).toBe(0);
  });

  it("removes a listener when its immediate subscription callback throws", async () => {
    const scheduler = createThumbnailScheduler({ concurrency: 1 });
    let calls = 0;

    expect(() => scheduler.subscribe(() => {
      calls += 1;
      throw new Error("initial listener failed");
    })).not.toThrow();

    await scheduler.enqueue("job", "visible", async () => "done").promise;
    await scheduler.onIdle();
    expect(calls).toBe(1);
  });

  it("makes discarded request handles terminal and inert", async () => {
    const controlled = createControlledJob();
    const scheduler = createThumbnailScheduler({ concurrency: 1, maxHistoricalJobs: 0 });
    const active = scheduler.enqueue("active", "selected", controlled.job);
    await controlled.started;
    let notifications = 0;
    scheduler.subscribe(() => {
      notifications += 1;
    });
    const discarded = scheduler.enqueue("discarded", "historical", job("discarded", []));
    await expect(discarded.promise).resolves.toBeUndefined();
    const notificationsAfterDiscard = notifications;

    discarded.setPriority("selected");
    discarded.release();
    await Promise.resolve();

    expect(notifications).toBe(notificationsAfterDiscard);
    expect(scheduler.getSnapshot().queued).toEqual({
      selected: 0,
      visible: 0,
      nearby: 0,
      mosaic: 0,
      historical: 0
    });
    controlled.finish();
    await expect(active.promise).resolves.toBe("active");
  });

  it("isolates snapshot identities and content from listener mutation", async () => {
    const scheduler = createThumbnailScheduler({ concurrency: 1 });
    const mutatedSnapshots: ReturnType<typeof scheduler.getSnapshot>[] = [];
    const cleanSnapshots: ReturnType<typeof scheduler.getSnapshot>[] = [];
    scheduler.subscribe((snapshot) => {
      mutatedSnapshots.push(snapshot);
      snapshot.queued.visible = 999;
    });
    scheduler.subscribe((snapshot) => cleanSnapshots.push(snapshot));

    await scheduler.enqueue("job", "visible", async () => "done").promise;
    await scheduler.onIdle();

    expect(cleanSnapshots.some((snapshot) => snapshot.queued.visible === 1)).toBe(true);
    expect(cleanSnapshots.every((snapshot) => snapshot.queued.visible !== 999)).toBe(true);
    expect(mutatedSnapshots[1]).not.toBe(cleanSnapshots[1]);
    expect(cleanSnapshots[0]).not.toBe(cleanSnapshots[1]);
    expect(scheduler.getSnapshot().queued.visible).toBe(0);
  });
});

function job(label: string, order: string[]) {
  return async () => {
    order.push(label);
    return label;
  };
}

function createDeferredJobs() {
  const releases = new Map<string, () => void>();
  const released = new Set<string>();
  return {
    job(label: string, order: string[]) {
      return async () => {
        order.push(label);
        if (released.has(label)) return label;
        await new Promise<void>((resolve) => releases.set(label, resolve));
        return label;
      };
    },
    release(label: string) {
      const resolve = releases.get(label);
      if (resolve) resolve();
      else released.add(label);
    }
  };
}

function createControlledJob() {
  let markStarted!: () => void;
  let finish!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  return {
    started,
    finish: () => finish(),
    job: async () => {
      markStarted();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return "active";
    }
  };
}
