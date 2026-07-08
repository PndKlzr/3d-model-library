import path from "node:path";
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
  addCatalogTag: (tag: string) => LibraryMetadata;
  removeCatalogTag: (tag: string) => LibraryMetadata;
  movePathMetadata: (sourcePath: string, destinationPath: string) => LibraryMetadata;
  recordSlicerOpen: (modelPath: string, slicerId: string, openedAt?: string) => LibraryMetadata;
};

const HISTORY_LIMIT = 100;

export function createDefaultLibraryMetadata(): LibraryMetadata {
  return {
    models: {},
    tagCatalog: [],
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
      const normalizedTags = normalizeTags(tags);
      const metadata = getMetadata();
      const currentModelMetadata = metadata.models[modelPath] ?? createEmptyModelMetadata();

      return saveMetadata({
        ...metadata,
        tagCatalog: normalizeTags([...metadata.tagCatalog, ...normalizedTags]),
        models: {
          ...metadata.models,
          [modelPath]: {
            ...currentModelMetadata,
            tags: normalizedTags
          }
        }
      });
    },

    addCatalogTag(tag) {
      const metadata = getMetadata();
      return saveMetadata({
        ...metadata,
        tagCatalog: normalizeTags([...metadata.tagCatalog, tag])
      });
    },

    removeCatalogTag(tag) {
      const [normalizedTag] = normalizeTags([tag]);
      const metadata = getMetadata();
      return saveMetadata({
        ...metadata,
        tagCatalog: metadata.tagCatalog.filter((catalogTag) => catalogTag !== normalizedTag)
      });
    },

    movePathMetadata(sourcePath, destinationPath) {
      if (samePath(sourcePath, destinationPath)) {
        return getMetadata();
      }

      const metadata = getMetadata();
      const nextModels: LibraryMetadata["models"] = {};

      for (const [modelPath, modelMetadata] of Object.entries(metadata.models)) {
        nextModels[movePathIfInside(modelPath, sourcePath, destinationPath) ?? modelPath] =
          modelMetadata;
      }

      return saveMetadata({
        ...metadata,
        models: nextModels,
        slicerHistory: metadata.slicerHistory.map((entry) => ({
          ...entry,
          modelPath: movePathIfInside(entry.modelPath, sourcePath, destinationPath) ?? entry.modelPath
        }))
      });
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
    tagCatalog: normalizeTags(metadata.tagCatalog ?? []),
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

function movePathIfInside(
  candidatePath: string,
  sourcePath: string,
  destinationPath: string
): string | null {
  const normalizedCandidate = path.resolve(candidatePath);
  const normalizedSource = path.resolve(sourcePath);
  const normalizedDestination = path.resolve(destinationPath);

  if (samePath(normalizedCandidate, normalizedSource)) {
    return normalizedDestination;
  }

  const relativePath = path.relative(normalizedSource, normalizedCandidate);
  const isInside =
    Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);

  return isInside ? path.join(normalizedDestination, relativePath) : null;
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}
