import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain as electronIpcMain,
  nativeImage,
  session,
  shell,
  type WebContents
} from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { TranslationKey } from "../src/i18n/catalog.js";
import { translate, type TranslationParams } from "../src/i18n/translate.js";
import type {
  AppSettings,
  ArchiveExtractionMode,
  FileDragRequest,
  FileDragStatus,
  FileOperationResult,
  FileRestorePair,
  LibraryBackupActionResult,
  LibrarySessionRef,
  ModelHashInput,
  SlicerConfig,
  ThumbnailCleanupResult,
  ThumbnailSignature
} from "../src/shared/types.js";
import {
  canSendToSlicer,
  toSupportedFileExtension
} from "../src/shared/fileCapabilities.js";
import {
  createActiveLibrarySession,
  type ActiveLibrarySession
} from "./services/activeLibrarySession.js";
import { isPathAtOrInside, isPathInside } from "./services/pathContainment.js";
import {
  createActiveLibraryMetadataStore,
  type ActiveLibraryMetadataStore
} from "./services/activeLibraryMetadataStore.js";
import { extractArchive, extractArchiveEntries, listArchiveEntries } from "./services/archiveManager.js";
import {
  createLibraryFolder,
  moveLibraryFolder,
  moveModelFiles,
  renameLibraryFolder,
  renameModelFile,
  restoreLibraryPaths,
  saveConvertedStlFile,
  trashLibraryFolder,
  trashModelFiles
} from "./services/fileOrganizer.js";
import { scanLibrary } from "./services/libraryScanner.js";
import {
  createLibraryIndexStore,
  type LibraryIndexStore
} from "./services/libraryIndexStore.js";
import { readModelMetadata } from "./services/modelMetadata.js";
import { readEmbeddedThumbnail } from "./services/modelThumbnail.js";
import {
  createLegacyElectronLibraryMetadataStore
} from "./services/libraryMetadataStore.js";
import { createElectronLibraryMetadataMirrorStore } from "./services/libraryMetadataMirrorStore.js";
import {
  createPortableMetadataRepository,
  type PortableMetadataRepository
} from "./services/portableMetadataRepository.js";
import {
  createNativeFileDragPayload,
  resolveDraggableFilePathsSync
} from "./services/fileDrag.js";
import { createElectronSettingsStore, type SettingsStore } from "./services/settingsStore.js";
import { launchSlicer } from "./services/slicerLauncher.js";
import { discoverWindowsSlicers } from "./services/slicerDiscovery.js";
import { inspectConfiguredSlicers, resolveSlicerExecutable } from "./services/slicerExecutable.js";
import { createElectronModelHashStore, type ModelHashStore } from "./services/modelHashStore.js";
import { createThumbnailCache, type ThumbnailCache } from "./services/thumbnailCache.js";
import {
  MAX_DIRECT_IMAGE_BYTES,
  openLibraryImage,
  readLibraryImageDataUrl
} from "./services/libraryImage.js";
import { readLibraryObjPreview } from "./services/libraryObj.js";
import { showLibraryDataFolder, showLibraryFolder } from "./services/libraryFolder.js";
import {
  createBenchmarkLibraryContext,
  type BenchmarkLibraryContext
} from "./services/benchmarkLibraryContext.js";
import { configureWindowSecurity } from "./services/windowSecurity.js";
import { resolveCanonicalLibraryFile } from "./services/libraryFileAccess.js";
import { createTrustedIpc, denyUnusedPermissions } from "./services/ipcSecurity.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const benchmarkEnvironment = readBenchmarkEnvironment();
const benchmarkLibraryContext = benchmarkEnvironment
  ? createBenchmarkLibraryContext(benchmarkEnvironment.root)
  : null;
const benchmarkFailureProbe = process.env.MODEL_LIBRARY_BENCHMARK_FAILURE_PROBE;

if (benchmarkEnvironment) {
  app.setPath("userData", benchmarkEnvironment.userData);
}

let settingsStore: SettingsStore;
let libraryIndexStore: LibraryIndexStore;
let libraryMetadataStore: ActiveLibraryMetadataStore;
let portableMetadataRepository: PortableMetadataRepository;
let activeLibrarySession: ActiveLibrarySession | null = null;
let modelHashStore: ModelHashStore;
let thumbnailCache: ThumbnailCache;
let benchmarkScanResult: Awaited<ReturnType<typeof scanLibrary>> | null = null;
let benchmarkReportWritten = false;
let benchmarkFailed = false;
let benchmarkCachedIndexReadyMs = 0;
let benchmarkCachedGridVisibleMs = 0;
let benchmarkLibraryReconciliationSettledMs = 0;
let benchmarkReconciliationPromise: Promise<void> | null = null;
let benchmarkStartupStartedAt = 0;
let trustedRendererUrl = "";
const ipcMain = createTrustedIpc(electronIpcMain, () => {
  if (!trustedRendererUrl) throw new Error("Trusted renderer URL is not ready");
  return trustedRendererUrl;
});
const dragIcon = createFileDragIcon();

function mainT(key: TranslationKey, params?: TranslationParams) {
  return translate(settingsStore?.getSettings().locale ?? "pt-BR", key, params);
}

type BenchmarkEnvironment = {
  root: string;
  scenario: "cold" | "warm" | "scroll";
  output: string;
  userData: string;
};

function readBenchmarkEnvironment(): BenchmarkEnvironment | null {
  const root = process.env.MODEL_LIBRARY_BENCHMARK_ROOT;
  const scenario = process.env.MODEL_LIBRARY_BENCHMARK_SCENARIO;
  const output = process.env.MODEL_LIBRARY_BENCHMARK_OUTPUT;
  const userData = process.env.MODEL_LIBRARY_BENCHMARK_USER_DATA;
  const values = [root, scenario, output, userData];

  if (values.every((value) => value === undefined)) return null;
  if (!root || !path.isAbsolute(root)) throw new Error("Invalid benchmark library root");
  if (scenario !== "cold" && scenario !== "warm" && scenario !== "scroll") {
    throw new Error("Invalid benchmark scenario");
  }
  if (!output || !path.isAbsolute(output) || path.extname(output).toLowerCase() !== ".json") {
    throw new Error("Invalid benchmark output path");
  }
  if (!userData || !path.isAbsolute(userData)) throw new Error("Invalid benchmark userData path");
  const canonicalRoot = realpathSync(root);
  const canonicalOutput = path.join(realpathSync(path.dirname(output)), path.basename(output));
  const canonicalUserData = realpathSync(userData);
  if (
    isPathAtOrInside(canonicalRoot, canonicalOutput) ||
    isPathAtOrInside(canonicalRoot, canonicalUserData)
  ) {
    throw new Error("Benchmark writable paths must be outside the library");
  }

  return {
    root: canonicalRoot,
    scenario,
    output: canonicalOutput,
    userData: canonicalUserData
  };
}

function registerIpcHandlers() {
  ipcMain.handle("benchmark:get-config", () => null);
  ipcMain.handle("system:runtime-versions", () => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome
  }));
  ipcMain.handle("settings:get", () => settingsStore.getSettings());

  ipcMain.handle("settings:save", async (_event, settings: AppSettings) => {
    const previousSettings = settingsStore.getSettings();
    const validatedSettings = await validateChangedSlicerExecutables(previousSettings, settings);
    const currentSession = activeLibrarySession!.current();
    const libraryChanged = !sameOptionalPath(previousSettings.libraryPath, validatedSettings.libraryPath);

    if (libraryChanged && !sameOptionalPath(currentSession?.rootPath ?? null, validatedSettings.libraryPath)) {
      await activeLibrarySession!.activate(validatedSettings.libraryPath, validatedSettings.monitorLibrary);
    } else if (
      currentSession &&
      previousSettings.monitorLibrary !== validatedSettings.monitorLibrary
    ) {
      await activeLibrarySession!.setMonitoring(currentSession, validatedSettings.monitorLibrary);
    }

    return settingsStore.saveSettings(validatedSettings);
  });

  ipcMain.handle("settings:choose-library-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: mainT("dialog.chooseLibraryFolder"),
      properties: ["openDirectory"]
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("library:activate", (_event, rootPath: string | null, monitoring: boolean) =>
    activeLibrarySession!.activate(rootPath, monitoring === true)
  );

  ipcMain.handle("library:current", () => activeLibrarySession!.currentState());

  ipcMain.handle("library:scan", (_event, expected: LibrarySessionRef) =>
    activeLibrarySession!.scan(expected)
  );

  ipcMain.handle("library:verify", (_event, expected: LibrarySessionRef) =>
    activeLibrarySession!.verify(expected)
  );

  ipcMain.handle("library:rebuild-index", (_event, expected: LibrarySessionRef) =>
    activeLibrarySession!.rebuildIndex(expected)
  );

  ipcMain.handle("library:show-data-folder", (_event, expected: LibrarySessionRef) =>
    showLibraryDataFolder(expected, {
      getCurrentSession: () => activeLibrarySession!.current(),
      getDataDirectory: (rootPath) => portableMetadataRepository.getDataDirectory(rootPath),
      openPath: (targetPath) => shell.openPath(targetPath)
    })
  );

  ipcMain.handle("library:set-monitoring", (
    _event,
    expected: LibrarySessionRef,
    enabled: boolean
  ) =>
    activeLibrarySession!.setMonitoring(expected, enabled === true)
  );

  ipcMain.handle("archive:list", (_event, archivePath: string) =>
    listArchiveEntries(requireLibraryPath(), archivePath, getArchiveToolOptions())
  );

  ipcMain.handle(
    "archive:extract",
    (_event, archivePath: string, entryPaths: string[], destinationRelativeFolder?: string) =>
      extractArchiveEntries(
        requireLibraryPath(),
        archivePath,
        entryPaths,
        destinationRelativeFolder,
        getArchiveToolOptions()
      )
  );

  ipcMain.handle(
    "archive:extract-all",
    (_event, archivePath: string, mode: ArchiveExtractionMode) =>
      extractArchive(requireLibraryPath(), archivePath, mode, getArchiveToolOptions())
  );

  ipcMain.handle(
    "library:create-folder",
    (_event, parentRelativeFolder: string, folderName: string) =>
      createLibraryFolder(requireLibraryPath(), parentRelativeFolder, folderName)
  );

  ipcMain.handle(
    "library:move-models",
    async (_event, sourcePaths: string[], destinationRelativeFolder: string) => {
      const libraryPath = requireLibraryPath();
      const result = await moveModelFiles(libraryPath, sourcePaths, destinationRelativeFolder);
      const metadataWarnings: string[] = [];

      for (const sourcePath of sourcePaths) {
        metadataWarnings.push(
          ...(await movePathMetadataSafely(
            sourcePath,
            resolveMovedModelPath(libraryPath, sourcePath, destinationRelativeFolder)
          ))
        );
      }

      return withMetadataWarnings(result, metadataWarnings);
    }
  );

  ipcMain.handle(
    "library:move-folder",
    async (_event, folderRelativePath: string, destinationRelativeFolder: string) => {
      const libraryPath = requireLibraryPath();
      const sourcePath = resolveLibraryRelativePath(libraryPath, folderRelativePath);
      const result = await moveLibraryFolder(
        libraryPath,
        folderRelativePath,
        destinationRelativeFolder
      );

      if (result.path) {
        return withMetadataWarnings(
          result,
          await movePathMetadataSafely(sourcePath, result.path)
        );
      }

      return result;
    }
  );

  ipcMain.handle(
    "library:rename-folder",
    async (_event, folderRelativePath: string, newName: string) => {
      const libraryPath = requireLibraryPath();
      const sourcePath = resolveLibraryRelativePath(libraryPath, folderRelativePath);
      const result = await renameLibraryFolder(libraryPath, folderRelativePath, newName);

      if (result.path) {
        return withMetadataWarnings(
          result,
          await movePathMetadataSafely(sourcePath, result.path)
        );
      }

      return result;
    }
  );

  ipcMain.handle(
    "library:rename-model-file",
    async (_event, sourcePath: string, newName: string) => {
      const result = await renameModelFile(requireLibraryPath(), sourcePath, newName);

      if (result.path) {
        return withMetadataWarnings(
          result,
          await movePathMetadataSafely(sourcePath, result.path)
        );
      }

      return result;
    }
  );

  ipcMain.handle("model:save-converted-stl", (_event, sourcePath: string, stlContent: string) =>
    saveConvertedStlFile(requireLibraryPath(), sourcePath, stlContent)
  );

  ipcMain.handle("library:trash-models", (_event, sourcePaths: string[]) =>
    trashModelFiles(requireLibraryPath(), sourcePaths, (modelPath) => shell.trashItem(modelPath))
  );

  ipcMain.handle("library:trash-folder", (_event, folderRelativePath: string) =>
    trashLibraryFolder(requireLibraryPath(), folderRelativePath, (folderPath) =>
      shell.trashItem(folderPath)
    )
  );

  ipcMain.handle("library:restore-paths", async (_event, pathPairs: FileRestorePair[]) => {
    const result = await restoreLibraryPaths(requireLibraryPath(), pathPairs);
    const metadataWarnings: string[] = [];

    for (const pair of pathPairs) {
      metadataWarnings.push(
        ...(await movePathMetadataSafely(pair.sourcePath, pair.destinationPath))
      );
    }

    return withMetadataWarnings(result, metadataWarnings);
  });

  ipcMain.handle("metadata:get", () => libraryMetadataStore.getMetadata());
  ipcMain.handle("metadata:status", () => libraryMetadataStore.getStatus());
  ipcMain.handle("metadata:data-status", () => libraryMetadataStore.getDataStatus());
  ipcMain.handle(
    "metadata:export-backup",
    async (_event, expected: LibrarySessionRef): Promise<LibraryBackupActionResult> => {
      const result = await dialog.showSaveDialog({
        title: mainT("dialog.exportLibraryBackup"),
        defaultPath: `3D_LIBRARY_BACKUP_${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: mainT("dialog.jsonFiles"), extensions: ["json"] }]
      });
      if (result.canceled || !result.filePath) {
        return { state: "cancelled", message: mainT("message.backupCancelled") };
      }

      let exported = false;
      const published = await activeLibrarySession!.publishIfCurrent(expected, async () => {
        await portableMetadataRepository.exportBackup(
          expected.rootPath,
          libraryMetadataStore.exportManifest(),
          result.filePath!
        );
        exported = true;
      });
      if (!published || !exported) throw new Error(mainT("error.libraryInactive"));
      return { state: "exported", message: mainT("message.backupExported") };
    }
  );
  ipcMain.handle(
    "metadata:restore-backup",
    async (_event, expected: LibrarySessionRef): Promise<LibraryBackupActionResult> => {
      const selected = await dialog.showOpenDialog({
        title: mainT("dialog.restoreLibraryBackup"),
        filters: [{ name: mainT("dialog.jsonFiles"), extensions: ["json"] }],
        properties: ["openFile"]
      });
      if (selected.canceled || !selected.filePaths[0]) {
        return { state: "cancelled", message: mainT("message.backupCancelled") };
      }

      const inspected = await portableMetadataRepository.readExternalBackup(
        expected.rootPath,
        selected.filePaths[0]
      );
      const activeLibraryId = activeLibrarySession!.current()?.libraryId;
      const identity = inspected.preview.libraryId === activeLibraryId
        ? mainT("dialog.restoreLibraryBackupMatch")
        : mainT("dialog.restoreLibraryBackupMismatch");
      const confirmation = await dialog.showMessageBox({
        type: "warning",
        title: mainT("dialog.restoreLibraryBackupTitle"),
        message: mainT("dialog.restoreLibraryBackupTitle"),
        detail: mainT("dialog.restoreLibraryBackupDetail", {
          date: new Date(inspected.preview.updatedAt).toLocaleString(
            settingsStore.getSettings().locale
          ),
          models: inspected.preview.modelCount,
          tags: inspected.preview.tagCount,
          history: inspected.preview.historyCount,
          identity
        }),
        buttons: [mainT("dialog.restoreLibraryBackupConfirm"), mainT("common.cancel")],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      });
      if (confirmation.response !== 0) {
        return { state: "cancelled", message: mainT("message.backupCancelled") };
      }

      let metadata = libraryMetadataStore.getMetadata();
      const published = await activeLibrarySession!.publishIfCurrent(expected, async () => {
        metadata = await libraryMetadataStore.restoreManifest(inspected.manifest);
      });
      if (!published) throw new Error(mainT("error.libraryInactive"));
      return {
        state: "restored",
        message: mainT("message.backupRestored"),
        metadata,
        metadataStatus: libraryMetadataStore.getStatus()
      };
    }
  );
  ipcMain.handle("metadata:retry", async () => {
    await libraryMetadataStore.retry();
    return libraryMetadataStore.getStatus();
  });

  ipcMain.handle("metadata:toggle-favorite", (_event, modelPath: string) => {
    assertPathInsideLibrary(modelPath);
    return libraryMetadataStore.toggleFavorite(modelPath);
  });

  ipcMain.handle("metadata:set-tags", (_event, modelPath: string, tags: string[]) => {
    assertPathInsideLibrary(modelPath);
    return libraryMetadataStore.setTags(modelPath, tags);
  });

  ipcMain.handle("metadata:add-catalog-tag", (_event, tag: string) =>
    libraryMetadataStore.addCatalogTag(tag)
  );

  ipcMain.handle("metadata:remove-catalog-tag", (_event, tag: string) =>
    libraryMetadataStore.removeCatalogTag(tag)
  );

  ipcMain.handle("metadata:set-notes", (_event, modelPath: string, notes: string) => {
    assertPathInsideLibrary(modelPath);
    return libraryMetadataStore.setNotes(modelPath, notes);
  });

  ipcMain.handle("model:metadata", async (_event, absolutePath: string) => {
    const canonicalPath = await resolveCanonicalLibraryFile(requireLibraryPath(), absolutePath);
    return readModelMetadata(canonicalPath);
  });

  ipcMain.handle("model:thumbnail", async (_event, absolutePath: string) => {
    const canonicalPath = await resolveCanonicalLibraryFile(requireLibraryPath(), absolutePath);
    return readEmbeddedThumbnail(canonicalPath);
  });

  ipcMain.handle("image:read-data-url", (
    _event,
    session: LibrarySessionRef,
    absolutePath: string
  ) =>
    readLibraryImageDataUrl(session, absolutePath, createLibraryImageAccess())
  );

  ipcMain.handle("obj:read-preview-file", (
    _event,
    session: LibrarySessionRef,
    absolutePath: string
  ) => readLibraryObjPreview(session, absolutePath, createLibraryObjAccess()));

  ipcMain.handle("system:open-library-file", (
    _event,
    session: LibrarySessionRef,
    absolutePath: string
  ) =>
    openLibraryImage(session, absolutePath, createLibraryImageAccess())
  );

  ipcMain.handle("thumbnail:cache-read", async (_event, model) => {
    assertThumbnailSignature(model);
    assertPathInsideLibrary(model.absolutePath);
    const current = activeLibrarySession!.current();
    if (!current) throw new Error("Library session is not active");
    return thumbnailCache.read(model, createThumbnailOwner(current, model.absolutePath));
  });

  ipcMain.handle("thumbnail:cache-invalidate", async (_event, model) => {
    assertThumbnailSignature(model);
    assertPathInsideLibrary(model.absolutePath);
    await thumbnailCache.invalidate(model);
  });

  ipcMain.handle("thumbnail:cache-write", async (
    _event,
    model,
    dataUrl: string,
    sessionKey: string
  ) => {
    assertThumbnailSignature(model);
    assertPathInsideLibrary(model.absolutePath);

    if (typeof dataUrl !== "string") {
      throw new Error("Invalid thumbnail data");
    }

    const expected = activeLibrarySession!.current();
    if (!expected || sessionKey !== createThumbnailSessionKey(expected)) {
      throw new Error("Stale thumbnail session");
    }

    await thumbnailCache.write(
      model,
      dataUrl,
      createThumbnailOwner(expected, model.absolutePath),
      {
        key: sessionKey,
        publish: (commit) => activeLibrarySession!.publishIfCurrent(expected, commit)
      }
    );
  });

  ipcMain.handle("thumbnail:clean-library", async (
    _event,
    expected: LibrarySessionRef,
    models: ThumbnailSignature[]
  ): Promise<ThumbnailCleanupResult> => {
    if (!Array.isArray(models) || models.length > 100_000) {
      throw new Error("Invalid thumbnail cleanup input");
    }

    let result: ThumbnailCleanupResult | null = null;
    const published = await activeLibrarySession!.publishIfCurrent(expected, async () => {
      for (const model of models) {
        assertThumbnailSignature(model);
        await resolveCanonicalLibraryFile(expected.rootPath, model.absolutePath);
      }
      result = await thumbnailCache.cleanLibrary(expected.libraryId, models);
    });
    if (!published || !result) throw new Error("Stale thumbnail session");
    return result;
  });

  ipcMain.handle("model:hashes", async (_event, models: ModelHashInput[]) => {
    const libraryPath = requireLibraryPath();
    const canonicalModels = await Promise.all(models.map(async (model) => ({
      ...model,
      absolutePath: await resolveCanonicalLibraryFile(libraryPath, model.absolutePath)
    })));
    const canonicalHashes = await modelHashStore.getHashes(canonicalModels);

    return Object.fromEntries(models.map((model, index) => [
      model.absolutePath,
      canonicalHashes[canonicalModels[index].absolutePath]
    ]));
  });

  ipcMain.handle("model:show-in-folder", async (_event, absolutePath: string) => {
    const canonicalPath = await resolveCanonicalLibraryFile(requireLibraryPath(), absolutePath);
    shell.showItemInFolder(canonicalPath);
  });

  ipcMain.handle("library:show-folder", (
    _event,
    session: LibrarySessionRef,
    relativeFolder: string
  ) => showLibraryFolder(session, relativeFolder, createLibraryFolderAccess()));

  ipcMain.handle("system:copy-text", (_event, value: string) => {
    if (typeof value !== "string" || value.length > 4096 || value.includes("\0")) {
      throw new Error("Texto inválido para copiar.");
    }

    clipboard.writeText(value);
  });

  ipcMain.on("model:start-file-drag", (event, request: FileDragRequest) => {
    const sessionId = typeof request?.sessionId === "string" ? request.sessionId : "invalid-session";

    try {
      if (!request || typeof request.sessionId !== "string" || !Array.isArray(request.filePaths)) {
        throw new Error("Solicitacao de arraste invalida.");
      }

      const resolvedPaths = resolveDraggableFilePathsSync(
        requireLibraryPath(),
        request.filePaths
      );

      sendFileDragStatus(event.sender, {
        sessionId: request.sessionId,
        state: "started",
        message: `Arraste iniciado para ${resolvedPaths.length} arquivo(s).`
      });
      event.sender.startDrag(createNativeFileDragPayload(resolvedPaths, dragIcon));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendFileDragStatus(event.sender, { sessionId, state: "failed", message });
      console.error("[file-drag]", error);
    }
  });

  ipcMain.handle("settings:choose-slicer-executable", async () => {
    const result = await dialog.showOpenDialog({
      title: mainT("dialog.chooseSlicerExecutable"),
      filters: [{ name: mainT("dialog.executables"), extensions: ["exe"] }],
      properties: ["openFile"]
    });

    return result.canceled ? null : resolveSlicerExecutable(result.filePaths[0]);
  });

  ipcMain.handle("slicer:detect", () => discoverWindowsSlicers());
  ipcMain.handle("slicer:inspect-configured", () =>
    inspectConfiguredSlicers(settingsStore.getSettings().slicers));

  ipcMain.handle("settings:choose-archive-extractor", async () => {
    const result = await dialog.showOpenDialog({
      title: mainT("dialog.choose7Zip"),
      filters: [{ name: "7-Zip", extensions: ["exe"] }],
      properties: ["openFile"]
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("slicer:launch", async (_event, slicerId: string, modelPaths: string | string[]) => {
    const settings = settingsStore.getSettings();
    const slicer = settings.slicers.find((item) => item.id === slicerId);
    const requestedPaths = Array.isArray(modelPaths) ? modelPaths : [modelPaths];
    const launchPaths = requestedPaths.filter((modelPath) => {
      if (typeof modelPath !== "string") return false;
      const extension = toSupportedFileExtension(path.extname(modelPath));
      return extension ? canSendToSlicer(extension) : false;
    });

    if (!slicer) {
      return { ok: false, message: "Slicer não configurado." };
    }

    if (launchPaths.length === 0) {
      return { ok: false, message: "Selecione pelo menos um STL ou 3MF para abrir no slicer." };
    }

    for (const modelPath of launchPaths) {
      assertPathInsideLibrary(modelPath);
    }

    const result = await launchSlicer(slicer, launchPaths);

    if (result.ok) {
      try {
        for (const modelPath of launchPaths) {
          await libraryMetadataStore.recordSlicerOpen(modelPath, slicerId);
        }
      } catch (error) {
        console.error("[metadata] failed to save slicer history", error);
        return {
          ...result,
          message: `${result.message} O modelo foi aberto, mas o histórico recente não foi salvo.`
        };
      }
    }

    return result;
  });

  ipcMain.handle("model:read-file", async (_event, absolutePath: string) => {
    const canonicalPath = await resolveCanonicalLibraryFile(requireLibraryPath(), absolutePath);
    const buffer = await readFile(canonicalPath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });
}

async function validateChangedSlicerExecutables(
  previousSettings: AppSettings,
  nextSettings: AppSettings
): Promise<AppSettings> {
  const previousById = new Map(previousSettings.slicers.map((slicer) => [slicer.id, slicer]));
  const slicers = await Promise.all(nextSettings.slicers.map(async (slicer): Promise<SlicerConfig> => {
    if (!slicer.executablePath) {
      return { ...slicer, pathSource: null };
    }

    const previous = previousById.get(slicer.id);
    if (previous && sameOptionalPath(previous.executablePath, slicer.executablePath)) {
      return slicer;
    }

    return {
      ...slicer,
      executablePath: await resolveSlicerExecutable(slicer.executablePath),
      pathSource: slicer.pathSource ?? "manual"
    };
  }));

  return { ...nextSettings, slicers };
}

function registerBenchmarkIpcHandlers(
  environment: BenchmarkEnvironment,
  context: BenchmarkLibraryContext
) {
  ipcMain.handle("system:runtime-versions", () => getRuntimeVersions());
  ipcMain.handle("benchmark:get-config", () => {
    startBenchmarkReconciliation(environment);
    return {
      scenario: environment.scenario,
      models: benchmarkScanResult?.models ?? [],
      cachedIndexReadyMs: benchmarkCachedIndexReadyMs,
      session: context.session
    };
  });
  ipcMain.handle("benchmark:cached-grid-visible", () => {
    if (benchmarkCachedGridVisibleMs === 0) {
      benchmarkCachedGridVisibleMs = performance.now() - benchmarkStartupStartedAt;
    }
  });
  ipcMain.handle("benchmark:fatal", (_event, message: unknown) => {
    failBenchmark(new Error(typeof message === "string" ? message.slice(0, 512) : "Renderer failed"));
  });
  ipcMain.handle("model:thumbnail", async (_event, absolutePath: string) => {
    const canonicalPath = await resolveCanonicalLibraryFile(requireLibraryPath(), absolutePath);
    return readEmbeddedThumbnail(canonicalPath);
  });
  ipcMain.handle("image:read-data-url", (
    _event,
    session: LibrarySessionRef,
    absolutePath: string
  ) =>
    readLibraryImageDataUrl(session, absolutePath, createLibraryImageAccess())
  );
  ipcMain.handle("obj:read-preview-file", (
    _event,
    session: LibrarySessionRef,
    absolutePath: string
  ) => context.readObjPreview(session, absolutePath));
  ipcMain.handle("thumbnail:cache-read", async (_event, model) => {
    assertThumbnailSignature(model);
    assertPathInsideLibrary(model.absolutePath);
    return thumbnailCache.read(model);
  });
  ipcMain.handle("thumbnail:cache-invalidate", async (_event, model) => {
    assertThumbnailSignature(model);
    assertPathInsideLibrary(model.absolutePath);
    await thumbnailCache.invalidate(model);
  });
  ipcMain.handle("thumbnail:cache-write", async (_event, model, dataUrl: string) => {
    assertThumbnailSignature(model);
    assertPathInsideLibrary(model.absolutePath);
    if (typeof dataUrl !== "string") throw new Error("Invalid thumbnail data");
    await thumbnailCache.write(model, dataUrl);
  });
  ipcMain.handle("model:read-file", async (_event, absolutePath: string) => {
    const canonicalPath = await resolveCanonicalLibraryFile(requireLibraryPath(), absolutePath);
    const buffer = await readFile(canonicalPath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });
  ipcMain.handle("benchmark:submit-report", async (_event, submittedReport: unknown) => {
    try {
      if (benchmarkFailureProbe === "report") throw new Error("Forced report rejection");
      if (benchmarkReportWritten) throw new Error("Benchmark report was already submitted");
      await benchmarkReconciliationPromise;
      const report = sanitizeBenchmarkReport(submittedReport, environment);
      await writeFile(environment.output, `${JSON.stringify(report, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx"
      });
      benchmarkReportWritten = true;
      setImmediate(() => app.quit());
    } catch (error) {
      failBenchmark(error);
      throw error;
    }
  });
}

function startBenchmarkReconciliation(environment: BenchmarkEnvironment) {
  if (benchmarkReconciliationPromise) return benchmarkReconciliationPromise;
  benchmarkReconciliationPromise = scanLibrary(environment.root).then(async (result) => {
    await libraryIndexStore.save(
      environment.root,
      benchmarkLibraryContext!.session.libraryId,
      result
    );
    benchmarkScanResult = result;
    benchmarkLibraryReconciliationSettledMs = performance.now() - benchmarkStartupStartedAt;
  });
  void benchmarkReconciliationPromise.catch(failBenchmark);
  return benchmarkReconciliationPromise;
}

function failBenchmark(error: unknown) {
  if (benchmarkFailed) return;
  benchmarkFailed = true;
  console.error("[thumbnail-benchmark:fatal]", error);
  app.exit(1);
}

function sanitizeBenchmarkReport(value: unknown, environment: BenchmarkEnvironment) {
  const report = requireRecord(value, "benchmark report");
  if (report.schemaVersion !== 2) throw new Error("Invalid benchmark report schema");
  if (report.scenario !== environment.scenario) throw new Error("Invalid benchmark report scenario");

  const sizeBuckets = requireRecord(report.sizeBuckets, "size buckets");
  const timings = requireRecord(report.timingsMs, "timings");
  const thumbnail = requireRecord(report.thumbnail, "thumbnail diagnostics");
  const queued = requireRecord(thumbnail.queued, "queued diagnostics");
  const queuedByStage = requireRecord(thumbnail.queuedByStage, "queued stage diagnostics");
  const running = requireRecord(thumbnail.running, "running diagnostics");
  const longTasks = requireRecord(thumbnail.longTasks, "long task diagnostics");
  const retainedResults = requireRecord(thumbnail.retainedResults, "retained diagnostics");
  const failuresByExtension = requireRecord(
    thumbnail.failuresByExtension,
    "failure extension diagnostics"
  );
  const queueWaitMs = requireRecord(thumbnail.queueWaitMs, "queue wait diagnostics");
  const durationMs = requireRecord(thumbnail.durationMs, "duration diagnostics");

  return {
    schemaVersion: 2,
    scenario: environment.scenario,
    generatedAt: new Date().toISOString(),
    runtime: getRuntimeVersions(),
    modelCount: aggregateNumber(report.modelCount, "modelCount", true),
    sizeBuckets: {
      under1MiB: aggregateNumber(sizeBuckets.under1MiB, "under1MiB", true),
      oneToTenMiB: aggregateNumber(sizeBuckets.oneToTenMiB, "oneToTenMiB", true),
      overTenMiB: aggregateNumber(sizeBuckets.overTenMiB, "overTenMiB", true)
    },
    timingsMs: {
      cachedIndexReady: aggregateNumber(benchmarkCachedIndexReadyMs, "cachedIndexReady"),
      cachedGridVisible: aggregateNumber(benchmarkCachedGridVisibleMs, "cachedGridVisible"),
      libraryReconciliationSettled: aggregateNumber(
        benchmarkLibraryReconciliationSettledMs,
        "libraryReconciliationSettled"
      ),
      firstVisibleThumbnail: nullableAggregateNumber(
        timings.firstVisibleThumbnail,
        "firstVisibleThumbnail"
      ),
      initiallyVisibleSettled: aggregateNumber(
        timings.initiallyVisibleSettled,
        "initiallyVisibleSettled"
      ),
      thumbnailPassSettled: aggregateNumber(
        timings.thumbnailPassSettled,
        "thumbnailPassSettled"
      )
    },
    queuePeak: aggregateNumber(report.queuePeak, "queuePeak", true),
    thumbnail: {
      queued: sanitizeCounters(queued, ["selected", "visible", "nearby", "mosaic", "historical", "total"]),
      queuedByStage: sanitizeCounters(queuedByStage, ["io", "render", "total"]),
      running: sanitizeCounters(running, ["io", "render", "total"]),
      cacheHits: aggregateNumber(thumbnail.cacheHits, "cacheHits", true),
      cacheMisses: aggregateNumber(thumbnail.cacheMisses, "cacheMisses", true),
      embeddedHits: aggregateNumber(thumbnail.embeddedHits, "embeddedHits", true),
      renders: aggregateNumber(thumbnail.renders, "renders", true),
      failures: aggregateNumber(thumbnail.failures, "failures", true),
      failuresByExtension: sanitizeFailureExtensions(failuresByExtension),
      discardedHistorical: aggregateNumber(
        thumbnail.discardedHistorical,
        "discardedHistorical",
        true
      ),
      longTasks: {
        count: aggregateNumber(longTasks.count, "longTasks.count", true),
        maximumMs: aggregateNumber(longTasks.maximumMs, "longTasks.maximumMs")
      },
      retainedResults: {
        current: aggregateNumber(retainedResults.current, "retainedResults.current", true),
        peak: aggregateNumber(retainedResults.peak, "retainedResults.peak", true)
      },
      queueWaitMs: {
        io: sanitizeDuration(queueWaitMs.io, "queueWait.io"),
        render: sanitizeDuration(queueWaitMs.render, "queueWait.render")
      },
      durationMs: {
        io: sanitizeDuration(durationMs.io, "io"),
        render: sanitizeDuration(durationMs.render, "render"),
        total: sanitizeDuration(durationMs.total, "total")
      }
    }
  };
}

function getRuntimeVersions() {
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function aggregateNumber(value: unknown, label: string, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid aggregate ${label}`);
  }
  if (integer && !Number.isInteger(value)) throw new Error(`Invalid aggregate ${label}`);
  return value;
}

function nullableAggregateNumber(value: unknown, label: string) {
  return value === null ? null : aggregateNumber(value, label);
}

function sanitizeCounters(record: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, aggregateNumber(record[key], key, true)]));
}

function sanitizeDuration(value: unknown, label: string) {
  const duration = requireRecord(value, `${label} duration`);
  return {
    count: aggregateNumber(duration.count, `${label}.count`, true),
    average: aggregateNumber(duration.average, `${label}.average`),
    maximum: aggregateNumber(duration.maximum, `${label}.maximum`)
  };
}

function sanitizeFailureExtensions(record: Record<string, unknown>) {
  const allowedExtensions = [".stl", ".3mf", ".obj", ".png", ".jpg", ".jpeg", ".webp"];
  return Object.fromEntries(allowedExtensions
    .filter((extension) => record[extension] !== undefined)
    .map((extension) => [
      extension,
      aggregateNumber(record[extension], `failuresByExtension.${extension}`, true)
    ]));
}

function assertPathInsideLibrary(absolutePath: string) {
  const libraryPath = requireLibraryPath();

  if (!isPathInside(libraryPath, absolutePath)) {
    throw new Error("Model file is outside the configured library folder");
  }
}

function assertThumbnailSignature(value: unknown): asserts value is {
  absolutePath: string;
  sizeBytes: number;
  modifiedAt: string;
} {
  if (
    typeof value !== "object" ||
    value === null ||
    !("absolutePath" in value) ||
    typeof value.absolutePath !== "string" ||
    !("sizeBytes" in value) ||
    typeof value.sizeBytes !== "number" ||
    !("modifiedAt" in value) ||
    typeof value.modifiedAt !== "string"
  ) {
    throw new Error("Invalid thumbnail signature");
  }
}

function requireLibraryPath(): string {
  if (benchmarkEnvironment) return benchmarkEnvironment.root;
  const currentSession = activeLibrarySession!.current();

  if (!currentSession) {
    throw new Error("Library session is not active");
  }

  return currentSession.rootPath;
}

function createLibraryImageAccess() {
  return {
    getCurrentSession: () => activeLibrarySession?.current() ?? null,
    decodeImage: (bytes: Uint8Array, extension: string) => extension === ".webp" ||
      !nativeImage.createFromBuffer(Buffer.from(bytes)).isEmpty(),
    openPath: (targetPath: string) => shell.openPath(targetPath)
  };
}

function createLibraryObjAccess() {
  return {
    getCurrentSession: () => activeLibrarySession?.current() ?? null
  };
}

function createLibraryFolderAccess() {
  return {
    getCurrentSession: () => activeLibrarySession?.current() ?? null,
    openPath: (targetPath: string) => shell.openPath(targetPath)
  };
}

function createThumbnailSessionKey(session: LibrarySessionRef): string {
  return `${session.libraryId}:${session.generation}:${session.rootPath}`;
}

function createThumbnailOwner(session: LibrarySessionRef, absolutePath: string) {
  const relativePath = path.relative(session.rootPath, absolutePath);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error("Thumbnail file is outside the active library");
  }
  return { libraryId: session.libraryId, relativePath };
}

function getArchiveToolOptions() {
  return {
    extractorPath: settingsStore.getSettings().archiveExtractorPath
  };
}

function resolveLibraryRelativePath(libraryPath: string, relativePath: string): string {
  return path.resolve(libraryPath, relativePath);
}

function resolveMovedModelPath(
  libraryPath: string,
  sourcePath: string,
  destinationRelativeFolder: string
): string {
  return path.join(
    resolveLibraryRelativePath(libraryPath, destinationRelativeFolder),
    path.basename(sourcePath)
  );
}

async function movePathMetadataSafely(
  sourcePath: string,
  destinationPath: string
): Promise<string[]> {
  try {
    await libraryMetadataStore.movePathMetadata(sourcePath, destinationPath);
    return [];
  } catch (error) {
    console.error("[metadata] failed to migrate path metadata", {
      sourcePath,
      destinationPath,
      error
    });
    return ["Arquivos movidos, mas algumas tags/notas podem precisar ser recarregadas."];
  }
}

function withMetadataWarnings(
  result: FileOperationResult,
  metadataWarnings: string[]
): FileOperationResult {
  const uniqueWarnings = [...new Set(metadataWarnings)];

  if (uniqueWarnings.length === 0) {
    return result;
  }

  return {
    ...result,
    message: `${result.message} ${uniqueWarnings.join(" ")}`
  };
}

function sameOptionalPath(left: string | null, right: string | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

async function createWindow() {
  const window = new BrowserWindow({
    show: !benchmarkEnvironment,
    width: 1320,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#e9edf0",
    title: "3D Model Library",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      navigateOnDragDrop: false,
      backgroundThrottling: !benchmarkEnvironment
    }
  });

  window.webContents.on("console-message", (details) => {
    console.log(
      `[renderer:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`
    );
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer:load-failed] ${errorCode} ${errorDescription} ${validatedURL}`);
    if (benchmarkEnvironment) failBenchmark(new Error(`Renderer load failed: ${errorCode}`));
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[renderer:gone] ${details.reason}`);
    if (benchmarkEnvironment) failBenchmark(new Error(`Renderer exited: ${details.reason}`));
  });

  window.on("unresponsive", () => {
    if (benchmarkEnvironment) failBenchmark(new Error("Renderer became unresponsive"));
  });

  const rendererEntry = benchmarkEnvironment && benchmarkFailureProbe === "load"
    ? path.join(__dirname, "missing-benchmark-renderer.html")
    : path.join(__dirname, "..", "..", "dist-renderer", "index.html");
  const rendererUrl = isDev && !benchmarkEnvironment
    ? resolveDevRendererUrl(process.env.MODEL_LIBRARY_DEV_SERVER_URL)
    : pathToFileURL(rendererEntry).href;

  trustedRendererUrl = rendererUrl;
  configureWindowSecurity(window.webContents, rendererUrl);

  if (isDev && !benchmarkEnvironment) {
    await window.loadURL(rendererUrl);
  } else {
    await window.loadFile(rendererEntry);
  }
}

function resolveDevRendererUrl(configuredUrl: string | undefined): string {
  const parsed = new URL(configuredUrl ?? "http://127.0.0.1:5173/");

  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Invalid development renderer URL");
  }

  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

app.whenReady().then(async () => {
  denyUnusedPermissions(session.defaultSession);

  if (benchmarkEnvironment) {
    const context = benchmarkLibraryContext!;
    thumbnailCache = createThumbnailCache({
      cacheDirectory: path.join(app.getPath("userData"), "thumbnail-cache"),
      maxImageBytes: MAX_DIRECT_IMAGE_BYTES
    });
    libraryIndexStore = context.indexStore;
    const seededIndex = await scanLibrary(benchmarkEnvironment.root);
    await libraryIndexStore.save(
      benchmarkEnvironment.root,
      context.session.libraryId,
      seededIndex
    );

    benchmarkStartupStartedAt = performance.now();
    benchmarkScanResult = await libraryIndexStore.load(
      benchmarkEnvironment.root,
      context.session.libraryId
    );
    if (!benchmarkScanResult) throw new Error("Benchmark cached index was not restored");
    benchmarkCachedIndexReadyMs = performance.now() - benchmarkStartupStartedAt;

    registerBenchmarkIpcHandlers(benchmarkEnvironment, context);
    await createWindow();
    return;
  }

  settingsStore = await createElectronSettingsStore(app.getLocale());
  libraryIndexStore = createLibraryIndexStore();
  const legacyMetadataStore = await createLegacyElectronLibraryMetadataStore();
  const metadataMirrorStore = await createElectronLibraryMetadataMirrorStore();
  portableMetadataRepository = createPortableMetadataRepository();
  libraryMetadataStore = createActiveLibraryMetadataStore({
    repository: portableMetadataRepository,
    mirror: metadataMirrorStore,
    legacyStore: legacyMetadataStore
  });
  activeLibrarySession = createActiveLibrarySession({
    canonicalizeRoot: portableMetadataRepository.canonicalizeRoot,
    metadataStore: libraryMetadataStore,
    indexStore: libraryIndexStore,
    onChanged: (payload) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("library:changed", payload);
      }
    },
    onMonitoringError: (payload) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("library:monitoring-error", payload);
      }
    }
  });
  const startupSettings = settingsStore.getSettings();
  await activeLibrarySession.activate(startupSettings.libraryPath, startupSettings.monitorLibrary);
  modelHashStore = await createElectronModelHashStore();
  thumbnailCache = createThumbnailCache({
    cacheDirectory: path.join(app.getPath("userData"), "thumbnail-cache"),
    maxImageBytes: MAX_DIRECT_IMAGE_BYTES
  });
  registerIpcHandlers();
  await createWindow();
  setTimeout(() => {
    void thumbnailCache.prune().catch((error) => console.error("[thumbnail-cache]", error));
  }, 5_000);

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
}).catch(failBenchmark);

function sendFileDragStatus(sender: WebContents, status: FileDragStatus) {
  sender.send("model:file-drag-status", status);
  console.log(`[file-drag:${status.state}] ${status.sessionId} ${status.message}`);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void activeLibrarySession?.close();
});

function createFileDragIcon() {
  const width = 48;
  const height = 48;
  const bitmap = Buffer.alloc(width * height * 4);

  function fillRect(x: number, y: number, rectWidth: number, rectHeight: number, color: number[]) {
    for (let row = y; row < y + rectHeight; row += 1) {
      for (let column = x; column < x + rectWidth; column += 1) {
        const offset = (row * width + column) * 4;
        bitmap[offset] = color[2];
        bitmap[offset + 1] = color[1];
        bitmap[offset + 2] = color[0];
        bitmap[offset + 3] = color[3];
      }
    }
  }

  fillRect(5, 5, 38, 38, [34, 132, 127, 255]);
  fillRect(14, 10, 20, 28, [245, 249, 249, 255]);
  fillRect(18, 17, 12, 3, [34, 132, 127, 255]);
  fillRect(18, 24, 12, 3, [34, 132, 127, 255]);
  fillRect(18, 31, 8, 3, [34, 132, 127, 255]);

  return nativeImage.createFromBitmap(bitmap, { width, height, scaleFactor: 1 });
}
