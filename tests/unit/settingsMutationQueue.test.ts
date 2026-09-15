import { describe, expect, it, vi } from "vitest";
import { createSettingsMutationQueue } from "../../src/lib/settingsMutationQueue";
import {
  addCustomSlicer,
  applyDetectedSlicers,
  removeCustomSlicer,
  renameCustomSlicer,
  setDefaultSlicer,
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
      defaultSlicerId: null,
      slicers: [
        { id: "slicer-a", enabled: false },
        { id: "slicer-b", enabled: true, executablePath: "C:\\Apps\\B.exe" }
      ]
    });
  });

  it("adds custom slicers with stable unique ids and supports renaming", () => {
    const initial = settings();
    const first = addCustomSlicer("Meu Slicer", "C:\\Apps\\One.exe")(initial);
    const second = addCustomSlicer("Outro", "C:\\Apps\\Two.exe")(first);

    expect(first.slicers[0]).toMatchObject({
      name: "Meu Slicer",
      kind: "custom",
      executablePath: "C:\\Apps\\One.exe",
      enabled: true,
      pathSource: "manual"
    });
    expect(first.slicers[0].id).not.toBe(second.slicers[1].id);

    const renamed = renameCustomSlicer(first.slicers[0].id, "Slicer Renomeado")(second);
    expect(renamed.slicers[0]).toMatchObject({
      id: first.slicers[0].id,
      name: "Slicer Renomeado"
    });
  });

  it("changes the default only explicitly and clears it when a custom slicer is removed", () => {
    const withCustom = addCustomSlicer("Meu Slicer", "C:\\Apps\\One.exe")(settings());
    const customId = withCustom.slicers[0].id;
    const withDefault = setDefaultSlicer(customId)(withCustom);

    expect(withDefault.defaultSlicerId).toBe(customId);
    expect(removeCustomSlicer(customId)(withDefault)).toMatchObject({
      defaultSlicerId: null,
      slicers: []
    });
  });

  it("merges detection without overwriting manual paths or the chosen default", () => {
    const current = {
      ...settings(),
      defaultSlicerId: "cura",
      slicers: [
        { id: "cura", name: "Cura", kind: "built-in" as const, builtInKey: "cura" as const,
          executablePath: "C:\\Manual\\Cura.exe", enabled: true, pathSource: "manual" as const },
        { id: "orca-slicer", name: "OrcaSlicer", kind: "built-in" as const,
          builtInKey: "orca-slicer" as const, executablePath: "", enabled: false, pathSource: null }
      ]
    };
    const next = applyDetectedSlicers([
      { builtInKey: "cura", executablePath: "C:\\Detected\\Cura.exe", evidence: "app-path" },
      { builtInKey: "orca-slicer", executablePath: "C:\\Detected\\Orca.exe", evidence: "uninstall" }
    ])(current);

    expect(next.defaultSlicerId).toBe("cura");
    expect(next.slicers[0]).toMatchObject({ executablePath: "C:\\Manual\\Cura.exe", pathSource: "manual" });
    expect(next.slicers[1]).toMatchObject({ executablePath: "C:\\Detected\\Orca.exe", pathSource: "detected", enabled: true });
  });
});

function settings(): AppSettings {
  return {
    locale: "pt-BR",
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
