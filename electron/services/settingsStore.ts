import type { AppSettings, SlicerConfig } from "../../src/shared/types.js";
import { resolveAppLocale } from "../../src/i18n/translate.js";
import {
  createBuiltInSlicerConfigs,
  normalizeSlicerConfigs
} from "../../src/shared/slicerCatalog.js";

export type SettingsBackend = {
  get: () => AppSettings | undefined;
  set: (settings: AppSettings) => void;
};

export type SettingsStore = {
  getSettings: () => AppSettings;
  saveSettings: (settings: AppSettings) => AppSettings;
};

export function createDefaultSettings(systemLocale?: string): AppSettings {
  return {
    locale: resolveAppLocale(systemLocale),
    libraryPath: null,
    includeSubfolders: true,
    monitorLibrary: true,
    fileDragBehavior: "organize-default",
    archiveExtractorPath: "",
    defaultSlicerId: null,
    slicers: createBuiltInSlicerConfigs()
  };
}

export function createSettingsStore(
  backend?: SettingsBackend,
  systemLocale?: string
): SettingsStore {
  let memorySettings = backend ? undefined : createDefaultSettings(systemLocale);

  return {
    getSettings() {
      return cloneSettings(
        backend?.get() ?? memorySettings ?? createDefaultSettings(systemLocale),
        systemLocale
      );
    },

    saveSettings(settings) {
      const nextSettings = normalizeSettings(settings, systemLocale);

      if (backend) {
        backend.set(nextSettings);
      } else {
        memorySettings = nextSettings;
      }

      return cloneSettings(nextSettings);
    }
  };
}

export async function createElectronSettingsStore(systemLocale?: string): Promise<SettingsStore> {
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
      settings: createDefaultSettings(systemLocale)
    }
  });

  return createSettingsStore({
    get: () => store.get("settings"),
    set: (settings) => store.set("settings", settings)
  }, systemLocale);
}

function normalizeSettings(settings: AppSettings, systemLocale?: string): AppSettings {
  const slicers = normalizeSlicerConfigs(settings.slicers as Partial<SlicerConfig>[] | undefined);

  return {
    locale: settings.locale ? resolveAppLocale(settings.locale) : resolveAppLocale(systemLocale),
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

function cloneSettings(settings: AppSettings, systemLocale?: string): AppSettings {
  return normalizeSettings(settings, systemLocale);
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
