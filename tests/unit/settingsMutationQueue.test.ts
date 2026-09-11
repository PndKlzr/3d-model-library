import { describe, expect, it, vi } from "vitest";
import { createSettingsMutationQueue } from "../../src/lib/settingsMutationQueue";
import type { AppSettings } from "../../src/shared/types";

describe("settingsMutationQueue", () => {
  it("serializes overlapping mutations against the latest pending settings", async () => {
    const firstSaveReady = deferred<void>();
    const saves: AppSettings[] = [];
    const persist = vi.fn(async (next: AppSettings) => {
      saves.push(structuredClone(next));
      if (saves.length === 1) await firstSaveReady.promise;
      return next;
    });
    const queue = createSettingsMutationQueue(settings(), persist);

    const monitorSave = queue.enqueue((current) => ({ ...current, monitorLibrary: false }));
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    const foldersSave = queue.enqueue((current) => ({ ...current, includeSubfolders: false }));

    expect(persist).toHaveBeenCalledTimes(1);
    firstSaveReady.resolve();
    await Promise.all([monitorSave, foldersSave]);

    expect(saves.map(({ monitorLibrary, includeSubfolders }) => ({
      monitorLibrary,
      includeSubfolders
    }))).toEqual([
      { monitorLibrary: false, includeSubfolders: true },
      { monitorLibrary: false, includeSubfolders: false }
    ]);
  });

  it("rebases a queued mutation on committed settings after an earlier save fails", async () => {
    const firstSaveReady = deferred<void>();
    const saves: AppSettings[] = [];
    const persist = vi.fn(async (next: AppSettings) => {
      saves.push(structuredClone(next));
      if (saves.length === 1) {
        await firstSaveReady.promise;
        throw new Error("monitor save failed");
      }
      return next;
    });
    const queue = createSettingsMutationQueue(settings(), persist);

    const monitorSave = queue.enqueue((current) => ({ ...current, monitorLibrary: false }));
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    const foldersSave = queue.enqueue((current) => ({ ...current, includeSubfolders: false }));

    firstSaveReady.resolve();
    await expect(monitorSave).rejects.toThrow("monitor save failed");
    await expect(foldersSave).resolves.toMatchObject({
      monitorLibrary: true,
      includeSubfolders: false
    });
    expect(saves[1]).toMatchObject({
      monitorLibrary: true,
      includeSubfolders: false
    });
  });
});

function settings(): AppSettings {
  return {
    libraryPath: "C:\\Models",
    includeSubfolders: true,
    monitorLibrary: true,
    fileDragBehavior: "organize-default",
    archiveExtractorPath: "",
    defaultSlicerId: null,
    slicers: []
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
