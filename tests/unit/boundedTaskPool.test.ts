import { describe, expect, it } from "vitest";
import { runBounded } from "../../electron/services/boundedTaskPool";

describe("runBounded", () => {
  it("preserves result order without exceeding the configured concurrency", async () => {
    let active = 0;
    let maximum = 0;

    const values = await runBounded([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, value % 2 === 0 ? 1 : 4));
      active -= 1;
      return value * 2;
    });

    expect(values).toEqual([2, 4, 6, 8]);
    expect(maximum).toBeLessThanOrEqual(2);
  });

  it("rejects invalid concurrency limits", async () => {
    await expect(runBounded([1], 0, async (value) => value)).rejects.toThrow(
      "Concurrency must be at least 1"
    );
  });

  it("returns immediately for an empty input", async () => {
    await expect(runBounded([], 4, async (value) => value)).resolves.toEqual([]);
  });
});
