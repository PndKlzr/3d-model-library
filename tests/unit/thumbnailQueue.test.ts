import { describe, expect, it } from "vitest";
import { createTaskQueue } from "../../src/lib/thumbnailQueue";

describe("thumbnailQueue", () => {
  it("limits concurrent thumbnail work", async () => {
    const queue = createTaskQueue(2);
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];

    const makeTask = () =>
      new Promise<void>((resolve) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        releases.push(() => {
          active -= 1;
          resolve();
        });
      });

    queue.enqueue(makeTask);
    queue.enqueue(makeTask);
    queue.enqueue(makeTask);
    queue.enqueue(makeTask);

    await Promise.resolve();

    expect(maxActive).toBe(2);
    expect(queue.getActiveCount()).toBe(2);
    expect(queue.getPendingCount()).toBe(2);

    releases.shift()?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(maxActive).toBe(2);
    expect(queue.getActiveCount()).toBe(2);
    expect(queue.getPendingCount()).toBe(1);
  });
});
