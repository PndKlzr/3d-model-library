import { describe, expect, it } from "vitest";
import { createThumbnailScheduler } from "../../src/lib/thumbnailScheduler";

describe("thumbnailScheduler", () => {
  it("lets visible work overtake queued background work", async () => {
    const order: string[] = [];
    const scheduler = createThumbnailScheduler({ concurrency: 1 });

    scheduler.enqueue("active", "visible", job("active", order));
    scheduler.enqueue("old", "background", job("old", order));
    scheduler.enqueue("current", "visible", job("current", order));
    await scheduler.onIdle();

    expect(order).toEqual(["active", "current", "old"]);
  });

  it("deduplicates jobs while preserving subscriber priority", async () => {
    const order: string[] = [];
    const scheduler = createThumbnailScheduler({ concurrency: 1 });
    const first = scheduler.enqueue("same", "background", job("same", order));
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
});

function job(label: string, order: string[]) {
  return async () => {
    order.push(label);
    return label;
  };
}
