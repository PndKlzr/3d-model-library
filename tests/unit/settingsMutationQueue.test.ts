import { describe, expect, it, vi } from "vitest";
import { createSettingsMutationQueue } from "../../src/lib/settingsMutationQueue";
import {
  setSlicerEnabled,
  setSlicerExecutable
} from "../../src/lib/settingsMutations";
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

  it("preserves rapid toggles for two different slicers", async () => {
    const firstSaveReady = deferred<void>();
    const saves: AppSettings[] = [];
    const persist = vi.fn(async (next: AppSettings) => {
      saves.push(structuredClone(next));
      if (saves.length === 1) await firstSaveReady.promise;
      return next;
    });
    const queue = createSettingsMutationQueue(settingsWithSlicers(), persist);

    const first = queue.enqueue(setSlicerEnabled("slicer-a", false));
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    const second = queue.enqueue(setSlicerEnabled("slicer-b", false));

    firstSaveReady.resolve();
    await Promise.all([first, second]);

    expect(saves.at(-1)?.slicers).toMatchObject([
      { id: "slicer-a", enabled: false },
      { id: "slicer-b", enabled: false }
    ]);
  });

  it("preserves a pending toggle when another slicer executable is selected", async () => {
    const firstSaveReady = deferred<void>();
    const saves: AppSettings[] = [];
    const persist = vi.fn(async (next: AppSettings) => {
      saves.push(structuredClone(next));
      if (saves.length === 1) await firstSaveReady.promise;
      return next;
    });
    const queue = createSettingsMutationQueue(settingsWithSlicers(), persist);

    const first = queue.enqueue(setSlicerEnabled("slicer-a", false));
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    const second = queue.enqueue(setSlicerExecutable("slicer-b", "C:\\Apps\\B.exe"));

    firstSaveReady.resolve();
    const [, finalSettings] = await Promise.all([first, second]);

    expect(finalSettings).toMatchObject({
      defaultSlicerId: "slicer-b",
      slicers: [
        { id: "slicer-a", enabled: false },
        { id: "slicer-b", enabled: true, executablePath: "C:\\Apps\\B.exe" }
      ]
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

function settingsWithSlicers(): AppSettings {
  return {
    ...settings(),
    slicers: [
      { id: "slicer-a", name: "Slicer A", executablePath: "", enabled: true },
      { id: "slicer-b", name: "Slicer B", executablePath: "", enabled: true }
    ]
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
