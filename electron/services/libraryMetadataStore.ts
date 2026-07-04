import type { LibraryMetadata, ModelUserMetadata } from "../../src/shared/types.js";

export type LibraryMetadataBackend = {
  get: () => LibraryMetadata | undefined;
  set: (metadata: LibraryMetadata) => void;
};

export type LibraryMetadataStore = {
  getMetadata: () => LibraryMetadata;
  saveMetadata: (metadata: LibraryMetadata) => LibraryMetadata;
  toggleFavorite: (modelPath: string) => LibraryMetadata;
  setTags: (modelPath: string, tags: string[]) => LibraryMetadata;
  setNotes: (modelPath: string, notes: string) => LibraryMetadata;
  recordSlicerOpen: (modelPath: string, slicerId: string, openedAt?: string) => LibraryMetadata;
};

const HISTORY_LIMIT = 100;

export function createDefaultLibraryMetadata(): LibraryMetadata {
  return {
    models: {},
    slicerHistory: []
  };
}

export function createLibraryMetadataStore(
  backend?: LibraryMetadataBackend
): LibraryMetadataStore {
  let memoryMetadata = backend ? undefined : createDefaultLibraryMetadata();

  function getMetadata() {
    return cloneMetadata(backend?.get() ?? memoryMetadata ?? createDefaultLibraryMetadata());
  }

  function saveMetadata(metadata: LibraryMetadata) {
    const nextMetadata = normalizeMetadata(metadata);

    if (backend) {
      backend.set(nextMetadata);
    } else {
      memoryMetadata = nextMetadata;
    }

    return cloneMetadata(nextMetadata);
  }

  function updateModel(modelPath: string, updater: (metadata: ModelUserMetadata) => ModelUserMetadata) {
    const metadata = getMetadata();
    const currentModelMetadata = metadata.models[modelPath] ?? createEmptyModelMetadata();

    return saveMetadata({
      ...metadata,
      models: {
        ...metadata.models,
        [modelPath]: updater(currentModelMetadata)
      }
    });
  }

  return {
    getMetadata,
    saveMetadata,

    toggleFavorite(modelPath) {
      return updateModel(modelPath, (metadata) => ({
        ...metadata,
        favorite: !metadata.favorite
      }));
    },

    setTags(modelPath, tags) {
      return updateModel(modelPath, (metadata) => ({
        ...metadata,
        tags: normalizeTags(tags)
      }));
    },

    setNotes(modelPath, notes) {
      return updateModel(modelPath, (metadata) => ({
        ...metadata,
        notes
      }));
    },

    recordSlicerOpen(modelPath, slicerId, openedAt = new Date().toISOString()) {
      const metadata = getMetadata();
      return saveMetadata({
        ...metadata,
        slicerHistory: [
          { modelPath, slicerId, openedAt },
          ...metadata.slicerHistory.filter(
            (entry) => !(entry.modelPath === modelPath && entry.slicerId === slicerId)
          )
        ].slice(0, HISTORY_LIMIT)
      });
    }
  };
}

export async function createElectronLibraryMetadataStore(): Promise<LibraryMetadataStore> {
  const { default: Store } = await import("electron-store") as {
    default: new (options: {
      name: string;
      defaults: { metadata: LibraryMetadata };
    }) => {
      get: (key: "metadata") => LibraryMetadata;
      set: (key: "metadata", value: LibraryMetadata) => void;
    };
  };
  const store = new Store({
    name: "library-metadata",
    defaults: {
      metadata: createDefaultLibraryMetadata()
    }
  });

  return createLibraryMetadataStore({
    get: () => store.get("metadata"),
    set: (metadata) => store.set("metadata", metadata)
  });
}

function createEmptyModelMetadata(): ModelUserMetadata {
  return {
    favorite: false,
    tags: [],
    notes: ""
  };
}

function normalizeMetadata(metadata: LibraryMetadata): LibraryMetadata {
  return {
    models: Object.fromEntries(
      Object.entries(metadata.models ?? {}).map(([modelPath, modelMetadata]) => [
        modelPath,
        {
          favorite: Boolean(modelMetadata.favorite),
          tags: normalizeTags(modelMetadata.tags ?? []),
          notes: modelMetadata.notes ?? ""
        }
      ])
    ),
    slicerHistory: (metadata.slicerHistory ?? []).slice(0, HISTORY_LIMIT).map((entry) => ({
      modelPath: entry.modelPath,
      slicerId: entry.slicerId,
      openedAt: entry.openedAt
    }))
  };
}

function cloneMetadata(metadata: LibraryMetadata): LibraryMetadata {
  return normalizeMetadata(metadata);
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
}
