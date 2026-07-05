import { describe, expect, it } from "vitest";
import { createModelHashStore } from "../../electron/services/modelHashStore";
import type { ModelHashInput } from "../../src/shared/types";

describe("modelHashStore", () => {
  it("caches hashes until size or modified date changes", async () => {
    const savedMetadata: { current?: unknown } = {};
    const readCalls: string[] = [];
    const store = createModelHashStore(
      {
        get: () => savedMetadata.current,
        set: (metadata) => {
          savedMetadata.current = metadata;
        }
      },
      async (absolutePath) => {
        readCalls.push(absolutePath);
        return `hash:${readCalls.length}:${absolutePath}`;
      }
    );

    const input = modelHashInput("C:/library/a.stl", 100, "2026-07-04T00:00:00.000Z");

    const firstResult = await store.getHashes([input]);
    const secondResult = await store.getHashes([input]);
    const changedResult = await store.getHashes([
      modelHashInput("C:/library/a.stl", 101, "2026-07-04T00:00:00.000Z")
    ]);

    expect(firstResult[input.absolutePath]).toBe("hash:1:C:/library/a.stl");
    expect(secondResult[input.absolutePath]).toBe("hash:1:C:/library/a.stl");
    expect(changedResult[input.absolutePath]).toBe("hash:2:C:/library/a.stl");
    expect(readCalls).toEqual(["C:/library/a.stl", "C:/library/a.stl"]);
  });
});

function modelHashInput(
  absolutePath: string,
  sizeBytes: number,
  modifiedAt: string
): ModelHashInput {
  return {
    absolutePath,
    sizeBytes,
    modifiedAt
  };
}
