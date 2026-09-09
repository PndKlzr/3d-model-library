import { describe, expect, it } from "vitest";
import {
  createDefaultSettings,
  createSettingsStore
} from "../../electron/services/settingsStore";

describe("settingsStore", () => {
  it("returns defaults with no saved settings", () => {
    const store = createSettingsStore();

    expect(store.getSettings()).toEqual(createDefaultSettings());
    expect(store.getSettings().libraryPath).toBeNull();
    expect(store.getSettings().includeSubfolders).toBe(true);
    expect(store.getSettings().monitorLibrary).toBe(true);
    expect(store.getSettings().fileDragBehavior).toBe("organize-default");
    expect(store.getSettings().archiveExtractorPath).toBe("");
    expect(store.getSettings().defaultSlicerId).toBeNull();
    expect(store.getSettings().slicers).toEqual([
      { id: "cura", name: "Cura", executablePath: "", enabled: false },
      {
        id: "creality-print",
        name: "Creality Print",
        executablePath: "",
        enabled: false
      }
    ]);
  });

  it("saves a selected library path", () => {
    const store = createSettingsStore();

    store.saveSettings({
      ...store.getSettings(),
      libraryPath: "C:\\Users\\Example\\Desktop\\Models"
    });

    expect(store.getSettings().libraryPath).toBe("C:\\Users\\Example\\Desktop\\Models");
  });

  it("persists the include-subfolders toggle", () => {
    const store = createSettingsStore();

    store.saveSettings({
      ...store.getSettings(),
      includeSubfolders: false
    });

    expect(store.getSettings().includeSubfolders).toBe(false);
  });

  it("persists the automatic library monitoring toggle", () => {
    const store = createSettingsStore();

    store.saveSettings({
      ...store.getSettings(),
      monitorLibrary: false
    });

    expect(store.getSettings().monitorLibrary).toBe(false);
  });

  it("persists the preferred file drag behavior", () => {
    const store = createSettingsStore();

    store.saveSettings({
      ...store.getSettings(),
      fileDragBehavior: "external-default"
    });

    expect(store.getSettings().fileDragBehavior).toBe("external-default");
  });

  it("updates configured slicer executable paths", () => {
    const store = createSettingsStore();

    store.saveSettings({
      ...store.getSettings(),
      slicers: store.getSettings().slicers.map((slicer) =>
        slicer.id === "cura"
          ? {
              ...slicer,
              executablePath: "C:\\Program Files\\UltiMaker Cura\\Cura.exe",
              enabled: true
            }
          : slicer
      )
    });

    expect(store.getSettings().slicers[0]).toEqual({
      id: "cura",
      name: "Cura",
      executablePath: "C:\\Program Files\\UltiMaker Cura\\Cura.exe",
      enabled: true
    });
  });

  it("saves a default slicer id for double-click launches", () => {
    const store = createSettingsStore();

    store.saveSettings({
      ...store.getSettings(),
      defaultSlicerId: "creality-print"
    });

    expect(store.getSettings().defaultSlicerId).toBe("creality-print");
  });

  it("saves the optional 7-Zip executable path", () => {
    const store = createSettingsStore();

    store.saveSettings({
      ...store.getSettings(),
      archiveExtractorPath: "C:\\Program Files\\7-Zip\\7z.exe"
    });

    expect(store.getSettings().archiveExtractorPath).toBe("C:\\Program Files\\7-Zip\\7z.exe");
  });
});
