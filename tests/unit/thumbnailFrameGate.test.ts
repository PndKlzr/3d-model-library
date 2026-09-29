import { describe, expect, it } from "vitest";
import { yieldBeforeThumbnailRender } from "../../src/lib/thumbnailFrameGate";

describe("yieldBeforeThumbnailRender", () => {
  it("yields exactly one animation frame before resolving", async () => {
    const callbacks: FrameRequestCallback[] = [];
    const promise = yieldBeforeThumbnailRender((callback) => {
      callbacks.push(callback);
      return 1;
    });

    expect(callbacks).toHaveLength(1);
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    callbacks[0](16);
    await expect(promise).resolves.toBeUndefined();
  });
});
