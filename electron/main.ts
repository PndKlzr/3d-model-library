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
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppSettings,
  FileDragRequest,
  FileDragStatus,
  FileOperationResult,
  FileRestorePair,
  ModelHashInput
} from "../src/shared/types.js";
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
import { applyLibraryWatchEvents, scanLibrary } from "./services/libraryScanner.js";
import {
  createElectronLibraryIndexStore,
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
  createLibraryWatcher,
  type LibraryWatcherHandle
} from "./services/libraryWatcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const benchmarkEnvironment = readBenchmarkEnvironment();

if (benchmarkEnvironment) {
  app.setPath("userData", benchmarkEnvironment.userData);
}

let settingsStore: SettingsStore;
let libraryIndexStore: LibraryIndexStore;
let libraryMetadataStore: ActiveLibraryMetadataStore;
let modelHashStore: ModelHashStore;
let libraryWatcher: LibraryWatcherHandle | null = null;
let thumbnailCache: ThumbnailCache;
let watcherGeneration = 0;
let benchmarkScanResult: Awaited<ReturnType<typeof scanLibrary>> | null = null;
let benchmarkReportWritten = false;
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
  if (isPathAtOrInside(root, output) || isPathAtOrInside(root, userData)) {
    throw new Error("Benchmark writable paths must be outside the library");
  }

  return {
    root: path.resolve(root),
    scenario,
    output: path.resolve(output),
    userData: path.resolve(userData)
  };
}

function isPathAtOrInside(root: string, candidate: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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
    const savedSettings = settingsStore.saveSettings(settings);

    if (!sameOptionalPath(previousSettings.libraryPath, savedSettings.libraryPath)) {
      await setLibraryMonitoring(false);
      await libraryMetadataStore.open(savedSettings.libraryPath);

      if (savedSettings.libraryPath && savedSettings.monitorLibrary) {
        await setLibraryMonitoring(true);
      }
    }

    return savedSettings;
  });

  ipcMain.handle("settings:choose-library-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Escolha sua pasta de STLs e 3MFs",
      properties: ["openDirectory"]
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("library:get-cached", (_event, rootPath: string) => {
    assertConfiguredLibraryRoot(rootPath);
    return libraryIndexStore.get(rootPath);
  });

  ipcMain.handle("library:scan", async (_event, rootPath: string) => {
    assertConfiguredLibraryRoot(rootPath);
    const result = await scanLibrary(rootPath);
    libraryIndexStore.set(result);
    return result;
  });

  ipcMain.handle("library:set-monitoring", (_event, enabled: boolean) =>
    setLibraryMonitoring(enabled === true)
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

  ipcMain.handle("thumbnail:cache-read", async (_event, model) => {
    assertThumbnailSignature(model);
    assertPathInsideLibrary(model.absolutePath);
    return thumbnailCache.read(model);
  });

  ipcMain.handle("thumbnail:cache-write", async (_event, model, dataUrl: string) => {
    assertThumbnailSignature(model);
    assertPathInsideLibrary(model.absolutePath);

    if (typeof dataUrl !== "string") {
      throw new Error("Invalid thumbnail data");
    }

    await thumbnailCache.write(model, dataUrl);
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
  ipcMain.handle("benchmark:get-config", () => ({
    scenario: environment.scenario,
    models: benchmarkScanResult?.models ?? []
  }));
  ipcMain.handle("model:thumbnail", async (_event, absolutePath: string) => {
    assertPathInsideLibrary(absolutePath);
    return readEmbeddedThumbnail(absolutePath);
  });
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
    if (benchmarkReportWritten) throw new Error("Benchmark report was already submitted");
    const report = sanitizeBenchmarkReport(submittedReport, environment);
    benchmarkReportWritten = true;
    await writeFile(environment.output, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    setImmediate(() => app.quit());
  });
}

function sanitizeBenchmarkReport(value: unknown, environment: BenchmarkEnvironment) {
  const report = requireRecord(value, "benchmark report");
  if (report.schemaVersion !== 1) throw new Error("Invalid benchmark report schema");
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
    schemaVersion: 1,
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
      cachedGridVisible: aggregateNumber(timings.cachedGridVisible, "cachedGridVisible"),
      firstVisibleThumbnail: aggregateNumber(timings.firstVisibleThumbnail, "firstVisibleThumbnail"),
      initiallyVisibleSettled: aggregateNumber(
        timings.initiallyVisibleSettled,
        "initiallyVisibleSettled"
      ),
      fullReconciliation: aggregateNumber(timings.fullReconciliation, "fullReconciliation")
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

  const relativePath = path.relative(libraryPath, absolutePath);
  const isOutsideLibrary =
    relativePath.startsWith("..") || path.isAbsolute(relativePath) || relativePath === "";

  if (isOutsideLibrary) {
    throw new Error("Model file is outside the configured library folder");
  }
}

function assertConfiguredLibraryRoot(rootPath: string) {
  const libraryPath = requireLibraryPath();

  if (path.resolve(rootPath).toLowerCase() !== path.resolve(libraryPath).toLowerCase()) {
    throw new Error("Requested library does not match the configured library folder");
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
  const settings = settingsStore.getSettings();

  if (!settings.libraryPath) {
    throw new Error("Library folder is not configured");
  }

  return settings.libraryPath;
}

function getArchiveToolOptions() {
  return {
    extractorPath: settingsStore.getSettings().archiveExtractorPath
  };
}

async function setLibraryMonitoring(enabled: boolean): Promise<void> {
  watcherGeneration += 1;
  const generation = watcherGeneration;

  if (libraryWatcher) {
    await libraryWatcher.close();
    libraryWatcher = null;
  }

  if (!enabled) {
    return;
  }

  const libraryPath = requireLibraryPath();
  libraryWatcher = createLibraryWatcher({
    rootPath: libraryPath,
    onBatch: async (events) => {
      if (generation !== watcherGeneration) {
        return;
      }

      const current = libraryIndexStore.get(libraryPath) ?? (await scanLibrary(libraryPath));
      const result = await applyLibraryWatchEvents(current, events);
      libraryIndexStore.set(result);

      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("library:changed", events);
      }
    },
    onError: (error) => {
      if (generation !== watcherGeneration) {
        return;
      }

      watcherGeneration += 1;
      const message = error instanceof Error ? error.message : String(error);
      void libraryWatcher?.close();
      libraryWatcher = null;

      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(
          "library:monitoring-error",
          `Monitoramento pausado: ${message}`
        );
      }
    }
  });
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
      nodeIntegration: false
    }
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer:load-failed] ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[renderer:gone] ${details.reason}`);
  });

  if (isDev && !benchmarkEnvironment) {
    await window.loadURL("http://127.0.0.1:5173");
  } else {
    await window.loadFile(path.join(__dirname, "..", "..", "dist-renderer", "index.html"));
  }
}

app.whenReady().then(async () => {
  if (benchmarkEnvironment) {
    thumbnailCache = createThumbnailCache({
      cacheDirectory: path.join(app.getPath("userData"), "thumbnail-cache")
    });
    benchmarkScanResult = await scanLibrary(benchmarkEnvironment.root);
    registerBenchmarkIpcHandlers(benchmarkEnvironment);
    await createWindow();
    return;
  }

  settingsStore = await createElectronSettingsStore();
  libraryIndexStore = await createElectronLibraryIndexStore();
  const legacyMetadataStore = await createLegacyElectronLibraryMetadataStore();
  const metadataMirrorStore = await createElectronLibraryMetadataMirrorStore();
  libraryMetadataStore = createActiveLibraryMetadataStore({
    repository: createPortableMetadataRepository(),
    mirror: metadataMirrorStore,
    legacyStore: legacyMetadataStore
  });
  await libraryMetadataStore.open(settingsStore.getSettings().libraryPath);
  modelHashStore = await createElectronModelHashStore();
  thumbnailCache = createThumbnailCache({
    cacheDirectory: path.join(app.getPath("userData"), "thumbnail-cache")
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
});

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
  watcherGeneration += 1;
  void libraryWatcher?.close();
  libraryWatcher = null;
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
