import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  shell,
  type WebContents
} from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppSettings,
  FileDragRequest,
  FileDragStatus,
  FileOperationResult,
  FileRestorePair,
  LibrarySessionRef,
  ModelHashInput
} from "../src/shared/types.js";
import {
  createActiveLibrarySession,
  type ActiveLibrarySession
} from "./services/activeLibrarySession.js";
import { isPathAtOrInside, isPathInside } from "./services/pathContainment.js";
import {
  createActiveLibraryMetadataStore,
  type ActiveLibraryMetadataStore
} from "./services/activeLibraryMetadataStore.js";
import { extractArchiveEntries, listArchiveEntries } from "./services/archiveManager.js";
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
  createInMemoryLibraryIndexStore,
  createLibraryIndexStore,
  type LibraryIndexStore
} from "./services/libraryIndexStore.js";
import { readModelMetadata } from "./services/modelMetadata.js";
import { readEmbeddedThumbnail } from "./services/modelThumbnail.js";
import {
  createLegacyElectronLibraryMetadataStore
} from "./services/libraryMetadataStore.js";
import { createElectronLibraryMetadataMirrorStore } from "./services/libraryMetadataMirrorStore.js";
import { createPortableMetadataRepository } from "./services/portableMetadataRepository.js";
import {
  createNativeFileDragPayload,
  resolveDraggableFilePathsSync
} from "./services/fileDrag.js";
import { createElectronSettingsStore, type SettingsStore } from "./services/settingsStore.js";
import { launchSlicer } from "./services/slicerLauncher.js";
import { createElectronModelHashStore, type ModelHashStore } from "./services/modelHashStore.js";
import { createThumbnailCache, type ThumbnailCache } from "./services/thumbnailCache.js";
import {
  MAX_DIRECT_IMAGE_BYTES,
  openLibraryImage,
  readLibraryImageDataUrl
} from "./services/libraryImage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const benchmarkEnvironment = readBenchmarkEnvironment();
const benchmarkFailureProbe = process.env.MODEL_LIBRARY_BENCHMARK_FAILURE_PROBE;

if (benchmarkEnvironment) {
  app.setPath("userData", benchmarkEnvironment.userData);
}

let settingsStore: SettingsStore;
let libraryIndexStore: LibraryIndexStore;
let libraryMetadataStore: ActiveLibraryMetadataStore;
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
const dragIcon = createFileDragIcon();

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
    const currentSession = activeLibrarySession!.current();
    const libraryChanged = !sameOptionalPath(previousSettings.libraryPath, settings.libraryPath);

    if (libraryChanged && !sameOptionalPath(currentSession?.rootPath ?? null, settings.libraryPath)) {
      await activeLibrarySession!.activate(settings.libraryPath, settings.monitorLibrary);
    } else if (
      currentSession &&
      previousSettings.monitorLibrary !== settings.monitorLibrary
    ) {
      await activeLibrarySession!.setMonitoring(currentSession, settings.monitorLibrary);
    }

    return settingsStore.saveSettings(settings);
  });

  ipcMain.handle("settings:choose-library-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Escolha sua pasta de STLs e 3MFs",
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
    assertPathInsideLibrary(absolutePath);
    return readModelMetadata(absolutePath);
  });

  ipcMain.handle("model:thumbnail", async (_event, absolutePath: string) => {
    assertPathInsideLibrary(absolutePath);
    return readEmbeddedThumbnail(absolutePath);
  });

  ipcMain.handle("image:read-data-url", (
    _event,
    session: LibrarySessionRef,
    absolutePath: string
  ) =>
    readLibraryImageDataUrl(session, absolutePath, createLibraryImageAccess())
  );

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
    return thumbnailCache.read(model);
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

    await thumbnailCache.write(model, dataUrl, {
      key: sessionKey,
      publish: (commit) => activeLibrarySession!.publishIfCurrent(expected, commit)
    });
  });

  ipcMain.handle("model:hashes", async (_event, models: ModelHashInput[]) => {
    for (const model of models) {
      assertPathInsideLibrary(model.absolutePath);
    }

    return modelHashStore.getHashes(models);
  });

  ipcMain.handle("model:show-in-folder", (_event, absolutePath: string) => {
    assertPathInsideLibrary(absolutePath);
    shell.showItemInFolder(absolutePath);
  });

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
      title: "Escolha o executável do slicer",
      filters: [{ name: "Executáveis", extensions: ["exe"] }],
      properties: ["openFile"]
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("settings:choose-archive-extractor", async () => {
    const result = await dialog.showOpenDialog({
      title: "Escolha o 7z.exe",
      filters: [{ name: "7-Zip", extensions: ["exe"] }],
      properties: ["openFile"]
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("slicer:launch", async (_event, slicerId: string, modelPaths: string | string[]) => {
    const settings = settingsStore.getSettings();
    const slicer = settings.slicers.find((item) => item.id === slicerId);
    const launchPaths = Array.isArray(modelPaths) ? modelPaths : [modelPaths];

    if (!slicer) {
      return { ok: false, message: "Slicer não configurado." };
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
    assertPathInsideLibrary(absolutePath);

    const buffer = await readFile(absolutePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });
}

function registerBenchmarkIpcHandlers(environment: BenchmarkEnvironment) {
  ipcMain.handle("system:runtime-versions", () => getRuntimeVersions());
  ipcMain.handle("benchmark:get-config", () => {
    startBenchmarkReconciliation(environment);
    return {
      scenario: environment.scenario,
      models: benchmarkScanResult?.models ?? [],
      cachedIndexReadyMs: benchmarkCachedIndexReadyMs
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
    assertPathInsideLibrary(absolutePath);
    return readEmbeddedThumbnail(absolutePath);
  });
  ipcMain.handle("image:read-data-url", (
    _event,
    session: LibrarySessionRef,
    absolutePath: string
  ) =>
    readLibraryImageDataUrl(session, absolutePath, createLibraryImageAccess())
  );
  ipcMain.handle("thumbnail:cache-read", async (_event, model) => {
    assertThumbnailSignature(model);
    assertPathInsideLibrary(model.absolutePath);
    return thumbnailCache.read(model);
  });
  ipcMain.handle("thumbnail:cache-write", async (_event, model, dataUrl: string) => {
    assertThumbnailSignature(model);
    assertPathInsideLibrary(model.absolutePath);
    if (typeof dataUrl !== "string") throw new Error("Invalid thumbnail data");
    await thumbnailCache.write(model, dataUrl);
  });
  ipcMain.handle("model:read-file", async (_event, absolutePath: string) => {
    assertPathInsideLibrary(absolutePath);
    const buffer = await readFile(absolutePath);
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
    await libraryIndexStore.save(environment.root, "benchmark-library", result);
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
    decodeImage: (bytes: Uint8Array) =>
      !nativeImage.createFromBuffer(Buffer.from(bytes)).isEmpty(),
    openPath: (targetPath: string) => shell.openPath(targetPath)
  };
}

function createThumbnailSessionKey(session: LibrarySessionRef): string {
  return `${session.libraryId}:${session.generation}:${session.rootPath}`;
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
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#e9edf0",
    title: "3D Model Library",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: !benchmarkEnvironment
    }
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
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

  if (isDev && !benchmarkEnvironment) {
    await window.loadURL("http://127.0.0.1:5173");
  } else {
    const rendererEntry = benchmarkEnvironment && benchmarkFailureProbe === "load"
      ? path.join(__dirname, "missing-benchmark-renderer.html")
      : path.join(__dirname, "..", "..", "dist-renderer", "index.html");
    await window.loadFile(rendererEntry);
  }
}

app.whenReady().then(async () => {
  if (benchmarkEnvironment) {
    thumbnailCache = createThumbnailCache({
      cacheDirectory: path.join(app.getPath("userData"), "thumbnail-cache"),
      maxImageBytes: MAX_DIRECT_IMAGE_BYTES
    });
    libraryIndexStore = createInMemoryLibraryIndexStore();
    const seededIndex = await scanLibrary(benchmarkEnvironment.root);
    await libraryIndexStore.save(benchmarkEnvironment.root, "benchmark-library", seededIndex);

    benchmarkStartupStartedAt = performance.now();
    benchmarkScanResult = await libraryIndexStore.load(
      benchmarkEnvironment.root,
      "benchmark-library"
    );
    if (!benchmarkScanResult) throw new Error("Benchmark cached index was not restored");
    benchmarkCachedIndexReadyMs = performance.now() - benchmarkStartupStartedAt;

    registerBenchmarkIpcHandlers(benchmarkEnvironment);
    await createWindow();
    return;
  }

  settingsStore = await createElectronSettingsStore();
  libraryIndexStore = createLibraryIndexStore();
  const legacyMetadataStore = await createLegacyElectronLibraryMetadataStore();
  const metadataMirrorStore = await createElectronLibraryMetadataMirrorStore();
  const portableMetadataRepository = createPortableMetadataRepository();
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
