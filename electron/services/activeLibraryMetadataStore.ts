import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  FileContentIdentity,
  LibraryDataStatus,
  LibraryMetadata,
  LibraryMetadataStatus,
  ModelHashInput
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
  encodePortableMetadata,
  type PortableLibraryManifestV2
} from "./portableMetadataCodec.js";
import type { PortableMetadataRepository } from "./portableMetadataRepository.js";
import { isPathInside } from "./pathContainment.js";
import {
  computeStableFileIdentity,
  createFileIdentityService
} from "./fileIdentityService.js";

export type ActiveLibraryMetadataStoreOptions = {
  repository: PortableMetadataRepository;
  mirror: LibraryMetadataMirrorStore;
  legacyStore: LibraryMetadataStore;
  createLibraryId?: () => string;
  now?: () => string;
  identifyFile?: (modelPath: string) => Promise<FileContentIdentity | null>;
};

export type ActiveLibraryMetadataStore = {
  open: (rootPath: string | null) => Promise<void>;
  retry: () => Promise<void>;
  getLibraryId: () => string | null;
  getMetadata: () => LibraryMetadata;
  getStatus: () => LibraryMetadataStatus;
  getDataStatus: () => LibraryDataStatus;
  exportManifest: () => PortableLibraryManifestV2;
  restoreManifest: (value: unknown) => Promise<LibraryMetadata>;
  toggleFavorite: (modelPath: string) => Promise<LibraryMetadata>;
  setTags: (modelPath: string, tags: string[]) => Promise<LibraryMetadata>;
  setNotes: (modelPath: string, notes: string) => Promise<LibraryMetadata>;
  addCatalogTag: (tag: string) => Promise<LibraryMetadata>;
  removeCatalogTag: (tag: string) => Promise<LibraryMetadata>;
  setFileIdentity: (
    modelPath: string,
    identity: FileContentIdentity
  ) => Promise<LibraryMetadata>;
  movePathMetadata: (sourcePath: string, destinationPath: string) => Promise<LibraryMetadata>;
  movePathMetadataBatch: (
    moves: Array<{ sourcePath: string; destinationPath: string }>
  ) => Promise<LibraryMetadata>;
  ensureFileIdentities: (models: ModelHashInput[]) => Promise<void>;
  identifyFile: (modelPath: string) => Promise<FileContentIdentity | null>;
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
  now = () => new Date().toISOString(),
  identifyFile = computeStableFileIdentity
}: ActiveLibraryMetadataStoreOptions): ActiveLibraryMetadataStore {
  let requestedRoot: string | null = null;
  let activeRoot: string | null = null;
  let libraryId = "";
  let currentMetadata = createDefaultLibraryMetadata();
  let updatedAt: string | null = null;
  let corruptPrimaryPath: string | null = null;
  let status: LibraryMetadataStatus = unavailableStatus("Nenhuma biblioteca está conectada.");
  let mutationTail: Promise<void> = Promise.resolve();
  let identityGeneration = 0;
  const identityService = createFileIdentityService({ computeIdentity: identifyFile });
  const identityJobs = new Map<string, Promise<void>>();

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
    identityGeneration += 1;
    identityJobs.clear();
    await mutationTail;
    requestedRoot = rootPath;
    activeRoot = null;
    libraryId = "";
    currentMetadata = createDefaultLibraryMetadata();
    updatedAt = null;
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
        updatedAt = cached.updatedAt;
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
        updatedAt = cached.updatedAt;
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
      updatedAt = decoded.updatedAt;
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
      updatedAt = manifest.updatedAt;
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
    pathsToValidate: string[] = [],
    guard: () => boolean = () => true
  ): Promise<LibraryMetadata> {
    const operation = mutationTail.then(async () => {
      if (!guard()) return cloneLibraryMetadata(currentMetadata);
      assertWritable();
      for (const modelPath of pathsToValidate) assertPathInsideActiveRoot(modelPath);

      const reducer = createLibraryMetadataStore();
      reducer.saveMetadata(currentMetadata);
      const nextMetadata = mutate(reducer);
      const manifest = encodePortableMetadata(activeRoot!, libraryId, nextMetadata, now());
      await repository.save(activeRoot!, manifest, { corruptPrimaryPath });
      currentMetadata = cloneLibraryMetadata(nextMetadata);
      updatedAt = manifest.updatedAt;
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

  function scheduleIdentity(model: ModelHashInput): Promise<void> {
    const modelPath = path.resolve(model.absolutePath);
    const key = modelPath.toLowerCase();
    const existing = identityJobs.get(key);
    if (existing) return existing;

    const capturedGeneration = identityGeneration;
    const capturedRoot = activeRoot;
    const operation = identityService.identify(modelPath)
      .then(async (identity) => {
        if (!identity || !capturedRoot) return;
        if (model.sizeBytes >= 0 && identity.sizeBytes !== model.sizeBytes) return;
        if (model.modifiedAt && identity.modifiedAt !== model.modifiedAt) return;
        const isCurrent = () =>
          identityGeneration === capturedGeneration &&
          activeRoot !== null &&
          activeRoot.toLowerCase() === capturedRoot.toLowerCase() &&
          hasDurableModelData(currentMetadata, modelPath);
        if (!isCurrent()) return;
        await enqueueMutation(
          (reducer) => reducer.setFileIdentity(modelPath, identity),
          [modelPath],
          isCurrent
        );
      })
      .catch(() => undefined)
      .finally(() => {
        if (identityJobs.get(key) === operation) identityJobs.delete(key);
      });
    identityJobs.set(key, operation);
    return operation;
  }

  async function ensureFileIdentities(models: ModelHashInput[]) {
    const pending = models
      .filter((model) => {
        if (!hasDurableModelData(currentMetadata, model.absolutePath)) return false;
        const existing = currentMetadata.fileIdentities[model.absolutePath];
        return !existing ||
          existing.sizeBytes !== model.sizeBytes ||
          existing.modifiedAt !== model.modifiedAt;
      })
      .map(scheduleIdentity);
    await Promise.all(pending);
  }

  async function mutateModelAndScheduleIdentity(
    modelPath: string,
    mutate: (reducer: LibraryMetadataStore) => LibraryMetadata
  ) {
    const metadata = await enqueueMutation(mutate, [modelPath]);
    if (hasDurableModelData(metadata, modelPath)) {
      void scheduleIdentity({ absolutePath: modelPath, sizeBytes: -1, modifiedAt: "" });
    }
    return metadata;
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

    if (!isPathInside(activeRoot, candidatePath)) {
      throw new Error("O caminho do modelo não pertence à biblioteca ativa.");
    }
  }

  function exportManifest(): PortableLibraryManifestV2 {
    const rootPath = activeRoot ?? requestedRoot;
    if (!rootPath || !libraryId) {
      throw new Error("Os dados da biblioteca não estão disponíveis para exportação.");
    }

    return encodePortableMetadata(
      rootPath,
      libraryId,
      currentMetadata,
      updatedAt ?? now()
    );
  }

  function restoreManifest(value: unknown): Promise<LibraryMetadata> {
    const operation = mutationTail.then(async () => {
      assertWritable();
      const rootPath = activeRoot!;
      const decoded = decodePortableMetadata(rootPath, value);
      const replacementManifest = encodePortableMetadata(
        rootPath,
        libraryId,
        decoded.metadata,
        now()
      );
      const currentManifest = encodePortableMetadata(
        rootPath,
        libraryId,
        currentMetadata,
        updatedAt ?? now()
      );

      await repository.restoreBackup(rootPath, currentManifest, replacementManifest);
      currentMetadata = cloneLibraryMetadata(decoded.metadata);
      updatedAt = replacementManifest.updatedAt;
      corruptPrimaryPath = null;
      status = {
        availability: "ready",
        writable: true,
        source: "primary",
        message: null
      };
      await updateMirror(replacementManifest.updatedAt);
      return cloneLibraryMetadata(currentMetadata);
    });

    mutationTail = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  return {
    open,
    retry: () => open(requestedRoot),
    getLibraryId: () => libraryId || null,
    getMetadata: () => cloneLibraryMetadata(currentMetadata),
    getStatus: () => ({ ...status }),
    getDataStatus: () => ({
      libraryId: libraryId || null,
      updatedAt,
      availability: status.availability,
      writable: status.writable,
      source: status.source,
      modelCount: Object.keys(currentMetadata.models).length,
      tagCount: currentMetadata.tagCatalog.length
    }),
    exportManifest,
    restoreManifest,
    toggleFavorite: (modelPath) =>
      mutateModelAndScheduleIdentity(modelPath, (reducer) => reducer.toggleFavorite(modelPath)),
    setTags: (modelPath, tags) =>
      mutateModelAndScheduleIdentity(modelPath, (reducer) => reducer.setTags(modelPath, tags)),
    setNotes: (modelPath, notes) =>
      mutateModelAndScheduleIdentity(modelPath, (reducer) => reducer.setNotes(modelPath, notes)),
    addCatalogTag: (tag) => enqueueMutation((reducer) => reducer.addCatalogTag(tag)),
    removeCatalogTag: (tag) => enqueueMutation((reducer) => reducer.removeCatalogTag(tag)),
    setFileIdentity: (modelPath, identity) =>
      enqueueMutation(
        (reducer) => reducer.setFileIdentity(modelPath, identity),
        [modelPath]
      ),
    movePathMetadata: (sourcePath, destinationPath) =>
      enqueueMutation(
        (reducer) => reducer.movePathMetadata(sourcePath, destinationPath),
        [sourcePath, destinationPath]
      ),
    movePathMetadataBatch: (moves) =>
      enqueueMutation(
        (reducer) => reducer.movePathMetadataBatch(moves),
        moves.flatMap(({ sourcePath, destinationPath }) => [sourcePath, destinationPath])
      ),
    ensureFileIdentities,
    identifyFile: (modelPath) => identityService.identify(modelPath),
    recordSlicerOpen: (modelPath, slicerId, openedAt) =>
      mutateModelAndScheduleIdentity(
        modelPath,
        (reducer) => reducer.recordSlicerOpen(modelPath, slicerId, openedAt)
      )
  };
}

function filterLegacyMetadata(metadata: LibraryMetadata, rootPath: string): LibraryMetadata {
  const models = Object.fromEntries(
    Object.entries(metadata.models).filter(([modelPath]) => isPathInside(rootPath, modelPath))
  );
  return {
    models,
    // The legacy catalog has no root identity; only tags on scoped models can be attributed safely.
    tagCatalog: [...new Set(Object.values(models).flatMap((model) => model.tags))],
    slicerHistory: metadata.slicerHistory.filter((entry) =>
      isPathInside(rootPath, entry.modelPath)
    ),
    fileIdentities: Object.fromEntries(
      Object.entries(metadata.fileIdentities ?? {}).filter(([modelPath]) =>
        isPathInside(rootPath, modelPath)
      )
    )
  };
}

function hasDurableMetadata(metadata: LibraryMetadata): boolean {
  return (
    metadata.tagCatalog.length > 0 ||
    metadata.slicerHistory.length > 0 ||
    Object.keys(metadata.models).length > 0
  );
}

function hasDurableModelData(metadata: LibraryMetadata, modelPath: string): boolean {
  const entry = Object.entries(metadata.models).find(([candidate]) =>
    path.resolve(candidate).toLowerCase() === path.resolve(modelPath).toLowerCase()
  )?.[1];
  return Boolean(
    entry?.favorite ||
    entry?.tags.length ||
    entry?.notes.trim() ||
    metadata.slicerHistory.some((history) =>
      path.resolve(history.modelPath).toLowerCase() === path.resolve(modelPath).toLowerCase()
    )
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
