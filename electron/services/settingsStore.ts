import type { AppSettings, SlicerConfig } from "../../src/shared/types.js";

export type SettingsBackend = {
  get: () => AppSettings | undefined;
  set: (settings: AppSettings) => void;
};

export type SettingsStore = {
  getSettings: () => AppSettings;
  saveSettings: (settings: AppSettings) => AppSettings;
};

export function createDefaultSettings(): AppSettings {
  return {
    libraryPath: null,
    includeSubfolders: true,
    monitorLibrary: true,
    fileDragBehavior: "organize-default",
    archiveExtractorPath: "",
    defaultSlicerId: null,
    slicers: [
      { id: "cura", name: "Cura", executablePath: "", enabled: false },
      {
        id: "creality-print",
        name: "Creality Print",
        executablePath: "",
        enabled: false
      }
    ]
  };
}

export function createSettingsStore(backend?: SettingsBackend): SettingsStore {
  let memorySettings = backend ? undefined : createDefaultSettings();

  return {
    getSettings() {
      return cloneSettings(backend?.get() ?? memorySettings ?? createDefaultSettings());
    },

    saveSettings(settings) {
      const nextSettings = normalizeSettings(settings);

      if (backend) {
        backend.set(nextSettings);
      } else {
        memorySettings = nextSettings;
      }

      return cloneSettings(nextSettings);
    }
  };
}

export async function createElectronSettingsStore(): Promise<SettingsStore> {
  const { default: Store } = await import("electron-store") as {
    default: new (options: {
    name: string;
    defaults: { settings: AppSettings };
  }) => {
    get: (key: "settings") => AppSettings;
    set: (key: "settings", value: AppSettings) => void;
  };
  };
  const store = new Store({
    name: "settings",
    defaults: {
      settings: createDefaultSettings()
    }
  });

  return createSettingsStore({
    get: () => store.get("settings"),
    set: (settings) => store.set("settings", settings)
  });
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const slicers = settings.slicers.map((slicer: SlicerConfig) => ({ ...slicer }));

  return {
    libraryPath: settings.libraryPath,
    includeSubfolders: settings.includeSubfolders,
    monitorLibrary: settings.monitorLibrary !== false,
    fileDragBehavior:
      settings.fileDragBehavior === "external-default" ? "external-default" : "organize-default",
    archiveExtractorPath: settings.archiveExtractorPath ?? "",
    defaultSlicerId: normalizeDefaultSlicerId(settings.defaultSlicerId, slicers),
    slicers
  };
}

function cloneSettings(settings: AppSettings): AppSettings {
  return normalizeSettings(settings);
}

function normalizeDefaultSlicerId(
  defaultSlicerId: string | null | undefined,
  slicers: SlicerConfig[]
): string | null {
  if (!defaultSlicerId) {
    return null;
  }

  return slicers.some((slicer) => slicer.id === defaultSlicerId) ? defaultSlicerId : null;
}
