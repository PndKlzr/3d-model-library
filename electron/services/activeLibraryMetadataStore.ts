import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  LibraryMetadata,
  LibraryMetadataStatus
} from "../../src/shared/types.js";
import {
  cloneLibraryMetadata,
  createDefaultLibraryMetadata,
  createLibraryMetadataStore,
  type LibraryMetadataStore
} from "./libraryMetadataStore.js";
import type { LibraryMetadataMirrorStore } from "./libraryMetadataMirrorStore.js";
import {
  decodePortableMetadata,
  encodePortableMetadata
} from "./portableMetadataCodec.js";
import type { PortableMetadataRepository } from "./portableMetadataRepository.js";

export type ActiveLibraryMetadataStoreOptions = {
  repository: PortableMetadataRepository;
  mirror: LibraryMetadataMirrorStore;
  legacyStore: LibraryMetadataStore;
  createLibraryId?: () => string;
  now?: () => string;
};

export type ActiveLibraryMetadataStore = {
  open: (rootPath: string | null) => Promise<void>;
  retry: () => Promise<void>;
  getMetadata: () => LibraryMetadata;
  getStatus: () => LibraryMetadataStatus;
  toggleFavorite: (modelPath: string) => Promise<LibraryMetadata>;
  setTags: (modelPath: string, tags: string[]) => Promise<LibraryMetadata>;
  setNotes: (modelPath: string, notes: string) => Promise<LibraryMetadata>;
  addCatalogTag: (tag: string) => Promise<LibraryMetadata>;
  removeCatalogTag: (tag: string) => Promise<LibraryMetadata>;
  movePathMetadata: (sourcePath: string, destinationPath: string) => Promise<LibraryMetadata>;
  recordSlicerOpen: (
    modelPath: string,
    slicerId: string,
    openedAt?: string
  ) => Promise<LibraryMetadata>;
};

export function createActiveLibraryMetadataStore({
  repository,
  mirror,
  legacyStore,
  createLibraryId = randomUUID,
  now = () => new Date().toISOString()
}: ActiveLibraryMetadataStoreOptions): ActiveLibraryMetadataStore {
  let requestedRoot: string | null = null;
  let activeRoot: string | null = null;
  let libraryId = "";
  let currentMetadata = createDefaultLibraryMetadata();
  let corruptPrimaryPath: string | null = null;
  let status: LibraryMetadataStatus = unavailableStatus("Nenhuma biblioteca está conectada.");
  let mutationTail: Promise<void> = Promise.resolve();

  async function updateMirror(updatedAt: string) {
    if (!activeRoot) return;

    try {
      mirror.set({
        rootPath: activeRoot,
        libraryId,
        updatedAt,
        metadata: currentMetadata
      });
    } catch (error) {
      console.warn("[portable-metadata] não foi possível atualizar o espelho local", error);
    }
  }

  async function open(rootPath: string | null) {
    await mutationTail;
    requestedRoot = rootPath;
    activeRoot = null;
    libraryId = "";
    currentMetadata = createDefaultLibraryMetadata();
    corruptPrimaryPath = null;
    status = unavailableStatus("Nenhuma biblioteca está conectada.");

    if (!rootPath) return;

    try {
      activeRoot = await repository.canonicalizeRoot(rootPath);
    } catch {
      const cached = mirror.getByRoot(rootPath);
      if (cached) {
        currentMetadata = cloneLibraryMetadata(cached.metadata);
        libraryId = cached.libraryId;
        status = {
          availability: "unavailable",
          writable: false,
          source: "mirror",
          message: "A biblioteca não está disponível. Os dados exibidos são uma cópia local."
        };
      } else {
        status = unavailableStatus("A biblioteca não está disponível neste local.");
      }
      return;
    }

    let loaded;
    try {
      loaded = await repository.load(activeRoot);
    } catch {
      const cached = mirror.getByRoot(activeRoot);
      if (cached) {
        currentMetadata = cloneLibraryMetadata(cached.metadata);
        libraryId = cached.libraryId;
      }
      status = {
        availability: "read-only",
        writable: false,
        source: cached ? "mirror" : "empty",
        message: "Os arquivos de dados da biblioteca estão danificados. O conteúdo original foi preservado."
      };
      return;
    }

    const writable = await repository.checkWritable(activeRoot);

    if (loaded.manifest) {
      const decoded = decodePortableMetadata(activeRoot, loaded.manifest);
      libraryId = decoded.libraryId;
      currentMetadata = decoded.metadata;
      corruptPrimaryPath = loaded.corruptPrimaryPath;
      status = {
        availability: writable ? "ready" : "read-only",
        writable,
        source: loaded.source,
        message: writable
          ? loaded.warning
          : "A biblioteca pode ser lida, mas a pasta de dados não permite alterações."
      };
      return;
    }

    const migratedMetadata = filterLegacyMetadata(legacyStore.getMetadata(), activeRoot);
    const hasLegacyData = hasDurableMetadata(migratedMetadata);
    currentMetadata = migratedMetadata;
    libraryId = createLibraryId();

    if (!writable) {
      status = {
        availability: "read-only",
        writable: false,
        source: hasLegacyData ? "legacy" : "empty",
        message: "A biblioteca pode ser lida, mas a pasta de dados não permite alterações."
      };
      return;
    }

    const manifest = encodePortableMetadata(activeRoot, libraryId, currentMetadata, now());
    try {
      await repository.save(activeRoot, manifest);
      status = {
        availability: "ready",
        writable: true,
        source: hasLegacyData ? "legacy" : "empty",
        message: hasLegacyData ? "Os dados antigos foram migrados para esta biblioteca." : null
      };
      await updateMirror(manifest.updatedAt);
    } catch {
      status = {
        availability: "read-only",
        writable: false,
        source: hasLegacyData ? "legacy" : "empty",
        message: "Não foi possível criar o arquivo de dados dentro da biblioteca."
      };
    }
  }

  function enqueueMutation(
    mutate: (reducer: LibraryMetadataStore) => LibraryMetadata,
    pathsToValidate: string[] = []
  ): Promise<LibraryMetadata> {
    const operation = mutationTail.then(async () => {
      assertWritable();
      for (const modelPath of pathsToValidate) assertPathInsideActiveRoot(modelPath);

      const reducer = createLibraryMetadataStore();
      reducer.saveMetadata(currentMetadata);
      const nextMetadata = mutate(reducer);
      const manifest = encodePortableMetadata(activeRoot!, libraryId, nextMetadata, now());
      await repository.save(activeRoot!, manifest, { corruptPrimaryPath });
      currentMetadata = cloneLibraryMetadata(nextMetadata);
      corruptPrimaryPath = null;
      status = {
        availability: "ready",
        writable: true,
        source: "primary",
        message: null
      };
      await updateMirror(manifest.updatedAt);
      return cloneLibraryMetadata(currentMetadata);
    });

    mutationTail = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  function assertWritable() {
    if (!activeRoot || !status.writable) {
      throw new Error(status.message ?? "Os dados da biblioteca não estão disponíveis para edição.");
    }
  }

  function assertPathInsideActiveRoot(candidatePath: string) {
    if (!activeRoot || typeof candidatePath !== "string" || !path.isAbsolute(candidatePath)) {
      throw new Error("O caminho do modelo não pertence à biblioteca ativa.");
    }

    const relativePath = path.relative(activeRoot, path.resolve(candidatePath));
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error("O caminho do modelo não pertence à biblioteca ativa.");
    }
  }

  return {
    open,
    retry: () => open(requestedRoot),
    getMetadata: () => cloneLibraryMetadata(currentMetadata),
    getStatus: () => ({ ...status }),
    toggleFavorite: (modelPath) =>
      enqueueMutation((reducer) => reducer.toggleFavorite(modelPath), [modelPath]),
    setTags: (modelPath, tags) =>
      enqueueMutation((reducer) => reducer.setTags(modelPath, tags), [modelPath]),
    setNotes: (modelPath, notes) =>
      enqueueMutation((reducer) => reducer.setNotes(modelPath, notes), [modelPath]),
    addCatalogTag: (tag) => enqueueMutation((reducer) => reducer.addCatalogTag(tag)),
    removeCatalogTag: (tag) => enqueueMutation((reducer) => reducer.removeCatalogTag(tag)),
    movePathMetadata: (sourcePath, destinationPath) =>
      enqueueMutation(
        (reducer) => reducer.movePathMetadata(sourcePath, destinationPath),
        [sourcePath, destinationPath]
      ),
    recordSlicerOpen: (modelPath, slicerId, openedAt) =>
      enqueueMutation(
        (reducer) => reducer.recordSlicerOpen(modelPath, slicerId, openedAt),
        [modelPath]
      )
  };
}

function filterLegacyMetadata(metadata: LibraryMetadata, rootPath: string): LibraryMetadata {
  return {
    models: Object.fromEntries(
      Object.entries(metadata.models).filter(([modelPath]) => isAbsolutePathInside(rootPath, modelPath))
    ),
    tagCatalog: [...metadata.tagCatalog],
    slicerHistory: metadata.slicerHistory.filter((entry) =>
      isAbsolutePathInside(rootPath, entry.modelPath)
    )
  };
}

function isAbsolutePathInside(rootPath: string, candidatePath: string): boolean {
  if (!path.isAbsolute(candidatePath)) return false;
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function hasDurableMetadata(metadata: LibraryMetadata): boolean {
  return (
    metadata.tagCatalog.length > 0 ||
    metadata.slicerHistory.length > 0 ||
    Object.keys(metadata.models).length > 0
  );
}

function unavailableStatus(message: string): LibraryMetadataStatus {
  return {
    availability: "unavailable",
    writable: false,
    source: "empty",
    message
  };
}
