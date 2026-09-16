import type { CSSProperties } from "react";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ConfirmDialog, type ConfirmDialogOptions } from "./components/ConfirmDialog";
import { I18nProvider } from "./i18n/I18nProvider";
import type { TranslationKey } from "./i18n/catalog";
import { translate, type TranslationParams } from "./i18n/translate";
import {
  localizeErrorMessage,
  localizeOperationMessage
} from "./shared/appError";
import { DetailsPanel, type ModelPreviewRequest } from "./components/DetailsPanel";
import { DialogHeader } from "./components/DialogHeader";
import { DialogShell } from "./components/DialogShell";
import { FirstRun } from "./components/FirstRun";
import { FolderTree } from "./components/FolderTree";
import { ModelGrid } from "./components/ModelGrid";
import { SettingsDialog } from "./components/SettingsDialog";
import { TagSelector } from "./components/TagSelector";
import { TextInputDialog, type TextInputDialogOptions } from "./components/TextInputDialog";
import { appendActionLogEntry, markActionUndone } from "./lib/actionLog";
import { runAfterCommittedUpdate } from "./lib/committedExternalAction";
import { getContextMenuPosition } from "./lib/contextMenuPosition";
import { buildFolderTree, type FolderNode } from "./lib/folderTree";
import {
  ALL_FOLDERS_ID,
  filterModels,
  getFolderScopeModels,
  isFolderExcluded,
  reconcileExcludedFolders,
  type ModelSortMode,
  type NotesFilter,
  type TagMatchMode,
  type UsageFilter
} from "./lib/folderFilters";
import {
  createFolderNavigationEntry,
  createFolderNavigationHistory,
  goBackInFolderHistory,
  goForwardInFolderHistory,
  pushFolderHistory,
  type FolderNavigationEntry
} from "./lib/folderNavigationHistory";
import { getDragModelIds, getDragOutFilePaths } from "./lib/dragFiles";
import { getDefaultFileOpenAction } from "./lib/fileOpenAction";
import { getSlicerLaunchFilePaths } from "./lib/slicerLaunchSelection";
import { getDuplicateModelIds } from "./lib/duplicateModels";
import { getGridFolderCards } from "./lib/gridFolders";
import {
  loadLibraryViewPreferences,
  saveLibraryViewPreferences,
  type LibraryViewPreferencesV1
} from "./lib/libraryViewPreferences";
import {
  createLibrarySessionResetState,
  isCurrentLibraryResult
} from "./lib/librarySessionState";
import { updateSelectionForGesture } from "./lib/modelSelection";
import { modelThumbnailService } from "./lib/modelThumbnailService";
import { buildLibraryHealthSnapshot } from "./lib/libraryHealth";
import { librarySessionIssueRegistry } from "./lib/librarySessionIssueRegistry";
import {
  runThumbnailBenchmark,
  type ThumbnailBenchmarkScenario
} from "./lib/thumbnailBenchmark";
import {
  observeThumbnailLongTasks,
  type ThumbnailDiagnosticsSnapshot
} from "./lib/thumbnailDiagnostics";
import { getMouseNavigationIntent } from "./lib/mouseNavigation";
import { getRenameTarget, type FocusedLibraryItem } from "./lib/renameTarget";
import {
  toggleResponsivePanel,
  type ResponsivePanel
} from "./lib/responsivePanels";
import {
  createSettingsMutationQueue,
  type SettingsMutationQueue
} from "./lib/settingsMutationQueue";
import {
  addCustomSlicer,
  applyDetectedSlicers,
  removeCustomSlicer,
  renameCustomSlicer,
  setSlicerExecutable,
  type AppSettingsMutation
} from "./lib/settingsMutations";
import { convertThreeMfToStlInWorker } from "./lib/threeMfToStlWorker";
import {
  parseModelViewMode,
  parseThemeMode,
  type ModelViewMode,
  type ThemeMode
} from "./lib/viewPreferences";
import type {
  AppSettings,
  ArchiveExtractionMode,
  FileDragBehavior,
  FileRestorePair,
  LibraryActionLogEntry,
  LibraryMetadata,
  LibraryMetadataStatus,
  LibraryScanResult,
  LibrarySessionIssueFact,
  LibrarySessionRef,
  ModelHashResult,
  ModelFile
} from "./shared/types";
import {
  SUPPORTED_FILE_EXTENSIONS,
  canConvertToStl,
  canSendToSlicer,
  canShowThumbnail,
  isArchive,
  isDirectImage,
  type SupportedFileExtension
} from "./shared/fileCapabilities";

const EXPANDED_FOLDERS_STORAGE_KEY = "model-library-expanded-folders";
const MODEL_VIEW_MODE_STORAGE_KEY = "model-library-view-mode";
const THEME_MODE_STORAGE_KEY = "model-library-theme-mode";
const FOLDERS_PINNED_STORAGE_KEY = "model-library-folders-pinned";
const OPERATION_MESSAGE_TIMEOUT_MS = 6000;
const UNDO_TOAST_TIMEOUT_MS = 8000;
const CONTEXT_MENU_WIDTH = 320;
const FOLDER_CONTEXT_MENU_HEIGHT = 465;
const MODEL_CONTEXT_MENU_HEIGHT = 550;

type LocalActionLogEntry = LibraryActionLogEntry & {
  restorePairs?: FileRestorePair[];
};

type BenchmarkConfiguration = {
  scenario: ThumbnailBenchmarkScenario;
  models: ModelFile[];
  cachedIndexReadyMs: number;
  session: LibrarySessionRef;
};

function App() {
  const [benchmark, setBenchmark] = useState<BenchmarkConfiguration | null | undefined>();

  useEffect(() => {
    let mounted = true;
    window.modelLibrary.getThumbnailBenchmark()
      .then((configuration) => {
        if (mounted) setBenchmark(configuration);
      })
      .catch(() => {
        if (mounted) setBenchmark(null);
      });
    return () => { mounted = false; };
  }, []);

  if (benchmark === undefined) return null;
  if (benchmark) return <ThumbnailBenchmark configuration={benchmark} />;
  return <LibraryApp />;
}

function ThumbnailBenchmark({ configuration }: { configuration: BenchmarkConfiguration }) {
  const [cachedGridVisible, setCachedGridVisible] = useState(false);

  useLayoutEffect(() => {
    modelThumbnailService.beginLibrarySession(configuration.session);
  }, [configuration.session]);

  useLayoutEffect(() => {
    let active = true;
    const frame = requestAnimationFrame(() => {
      void window.modelLibrary.markThumbnailBenchmarkCachedGridVisible()
        .then(() => {
          if (active) setCachedGridVisible(true);
        })
        .catch((error) => {
          void window.modelLibrary.failThumbnailBenchmark(readErrorMessage(error));
        });
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!cachedGridVisible) return;
    const longTaskObserver = observeThumbnailLongTasks(modelThumbnailService);
    let active = true;
    longTaskObserver.start();

    void window.modelLibrary.getRuntimeVersions()
      .then((runtime) => runThumbnailBenchmark({
        scenario: configuration.scenario,
        models: configuration.models,
        request: (model, priority) => modelThumbnailService.request(model, priority),
        diagnostics: () => modelThumbnailService.getDiagnostics(),
        resetDiagnostics: () => modelThumbnailService.resetDiagnostics(),
        libraryScanReadyMs: configuration.cachedIndexReadyMs,
        runtime
      }))
      .then((report) => active ? window.modelLibrary.submitThumbnailBenchmark(report) : undefined)
      .catch((error) => {
        console.error("[thumbnail-benchmark]", error);
        void window.modelLibrary.failThumbnailBenchmark(readErrorMessage(error));
      });

    return () => {
      active = false;
      longTaskObserver.stop();
    };
  }, [cachedGridVisible, configuration]);

  return (
    <div className="model-grid benchmark-cached-grid" aria-hidden="true">
      {configuration.models.slice(0, 24).map((model) => (
        <div className="model-card" key={model.id}>{model.name}</div>
      ))}
    </div>
  );
}

function LibraryApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [unavailableSlicerIds, setUnavailableSlicerIds] = useState<string[]>([]);
  const [sessionIssues, setSessionIssues] = useState<LibrarySessionIssueFact[]>(
    () => librarySessionIssueRegistry.getSnapshot()
  );
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const [verifiedHealthScan, setVerifiedHealthScan] = useState<LibraryScanResult | null>(null);
  const [healthCheckedAt, setHealthCheckedAt] = useState<string | null>(null);
  const locale = settings?.locale ?? "pt-BR";
  const t = (key: TranslationKey, params?: TranslationParams) =>
    translate(locale, key, params);
  const localizeResult = (message: string) =>
    localizeOperationMessage(locale, message);
  const readLocalizedErrorMessage = (error: unknown) =>
    localizeErrorMessage(locale, error);
  const [scanResult, setScanResult] = useState<LibraryScanResult | null>(null);
  const [selectedFolder, setSelectedFolder] = useState(ALL_FOLDERS_ID);
  const [folderHistory, setFolderHistory] = useState(createFolderNavigationHistory);
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(() => new Set());
  const [modelPreviewRequest, setModelPreviewRequest] = useState<ModelPreviewRequest | null>(null);
  const modelPreviewRequestIdRef = useRef(0);
  const [lastSelectedModelId, setLastSelectedModelId] = useState<string | null>(null);
  const [lastFocusedItem, setLastFocusedItem] = useState<FocusedLibraryItem>("folder");
  const [draggedModelIds, setDraggedModelIds] = useState<string[]>([]);
  const draggedModelIdsRef = useRef<string[]>([]);
  const activeFileDragSessionRef = useRef<string | null>(null);
  const gridScrollTopRef = useRef(0);
  const gridScrollRestoreSequenceRef = useRef(0);
  const modelRevealSequenceRef = useRef(0);
  const [gridScrollRestoreRequest, setGridScrollRestoreRequest] = useState<{
    key: number;
    top: number;
  } | null>(null);
  const [modelRevealRequest, setModelRevealRequest] = useState<{
    key: number;
    modelId: string;
  } | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<{
    folderId: string;
    x: number;
    y: number;
  } | null>(null);
  const [modelContextMenu, setModelContextMenu] = useState<{
    model: ModelFile;
    x: number;
    y: number;
  } | null>(null);
  const [thumbnailRetryGenerations, setThumbnailRetryGenerations] = useState<
    Record<string, number>
  >({});
  const [thumbnailDiagnostics, setThumbnailDiagnostics] = useState<ThumbnailDiagnosticsSnapshot>(
    () => modelThumbnailService.getDiagnostics()
  );
  const [tagPickerDialog, setTagPickerDialog] = useState<{ model: ModelFile } | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() =>
    readExpandedFolders()
  );
  const [modelViewMode, setModelViewMode] = useState<ModelViewMode>(() =>
    parseModelViewMode(window.localStorage.getItem(MODEL_VIEW_MODE_STORAGE_KEY))
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    parseThemeMode(window.localStorage.getItem(THEME_MODE_STORAGE_KEY))
  );
  const [sortMode, setSortMode] = useState<ModelSortMode>("name");
  const [onlySelected, setOnlySelected] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [notesFilter, setNotesFilter] = useState<NotesFilter>("all");
  const [tagMatchMode, setTagMatchMode] = useState<TagMatchMode>("all");
  const [selectedTagFilters, setSelectedTagFilters] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [libraryViewPreferences, setLibraryViewPreferences] =
    useState<LibraryViewPreferencesV1 | null>(null);
  const [libraryMetadata, setLibraryMetadata] = useState<LibraryMetadata>({
    models: {},
    tagCatalog: [],
    slicerHistory: []
  });
  const [metadataStatus, setMetadataStatus] = useState<LibraryMetadataStatus>({
    availability: "unavailable",
    writable: false,
    source: "empty",
    message: t("message.libraryNotConnected")
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [monitorStatus, setMonitorStatus] = useState<"active" | "disabled" | "error">("disabled");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDetectingSlicers, setIsDetectingSlicers] = useState(false);
  const initialSlicerDetectionRef = useRef(false);
  const [responsivePanel, setResponsivePanel] = useState<ResponsivePanel>(null);
  const [foldersPinned, setFoldersPinned] = useState(() =>
    window.localStorage.getItem(FOLDERS_PINNED_STORAGE_KEY) === "true"
  );
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [actionLogEntries, setActionLogEntries] = useState<LocalActionLogEntry[]>([]);
  const [undoToast, setUndoToast] = useState<LocalActionLogEntry | null>(null);
  const [modelHashes, setModelHashes] = useState<ModelHashResult>({});
  const [textInputDialog, setTextInputDialog] = useState<TextInputDialogOptions | null>(null);
  const textInputResolver = useRef<((value: string | null) => void) | null>(null);
  const [confirmationDialog, setConfirmationDialog] = useState<ConfirmDialogOptions | null>(null);
  const confirmationResolver = useRef<((value: boolean) => void) | null>(null);
  const activeLibrarySessionRef = useRef<LibrarySessionRef | null>(null);
  const activationRequestRef = useRef(0);
  const settingsMutationQueueRef = useRef<SettingsMutationQueue<AppSettings> | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isFilteringStale = deferredSearchQuery !== searchQuery;

  useEffect(() => {
    let isMounted = true;
    window.modelLibrary.getSettings()
      .then(async (loadedSettings) => {
        if (!isMounted) return;
        settingsMutationQueueRef.current = createSettingsMutationQueue(
          loadedSettings,
          persistSettings
        );
        setSettings(loadedSettings);
        if (loadedSettings.libraryPath) {
          await activateLibrary(loadedSettings.libraryPath, loadedSettings.monitorLibrary);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
      activationRequestRef.current += 1;
    };
  }, []);

  useEffect(() => modelThumbnailService.subscribe(setThumbnailDiagnostics), []);

  useEffect(() => librarySessionIssueRegistry.subscribe(setSessionIssues), []);

  useEffect(() => {
    if (!settings || initialSlicerDetectionRef.current) return;
    initialSlicerDetectionRef.current = true;
    void detectInstalledSlicers();
  }, [settings]);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    void window.modelLibrary.inspectConfiguredSlicers()
      .then((ids) => {
        if (!cancelled) setUnavailableSlicerIds(ids);
      })
      .catch(() => {
        if (!cancelled) setUnavailableSlicerIds([]);
      });
    return () => { cancelled = true; };
  }, [settings?.slicers]);

  useEffect(() => {
    const longTaskObserver = observeThumbnailLongTasks(modelThumbnailService);
    longTaskObserver.start();
    return () => longTaskObserver.stop();
  }, []);

  useEffect(() => {
    const unsubscribeChanged = window.modelLibrary.onLibraryChanged((payload) => {
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, payload.session)) return;
      void scanLibrarySession(payload.session);
    });
    const unsubscribeError = window.modelLibrary.onLibraryMonitoringError((payload) => {
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, payload.session)) return;
      setMonitorStatus("error");
      setMonitoringError(payload.message);
      setOperationMessage(translate(locale, "message.monitorPaused", {
        detail: localizeErrorMessage(locale, new Error(payload.message))
      }));
    });

    return () => {
      unsubscribeChanged();
      unsubscribeError();
    };
  }, [locale]);

  const libraryHealth = useMemo(() => buildLibraryHealthSnapshot({
    rootPath: activeLibrarySessionRef.current?.rootPath ?? settings?.libraryPath ?? "",
    checkedAt: healthCheckedAt,
    scanResult: verifiedHealthScan ?? scanResult,
    metadata: libraryMetadata,
    metadataStatus,
    sessionIssues,
    monitoringError,
    unavailableSlicerIds
  }), [
    healthCheckedAt,
    libraryMetadata,
    metadataStatus,
    monitoringError,
    scanResult,
    sessionIssues,
    settings?.libraryPath,
    unavailableSlicerIds,
    verifiedHealthScan
  ]);

  useEffect(() => {
    const unsubscribe = window.modelLibrary.onFileDragStatus?.((status) => {
      setOperationMessage(
        status.state === "failed"
          ? readLocalizedErrorMessage(new Error(status.message))
          : localizeResult(status.message)
      );

      if (
        status.state !== "started" &&
        status.sessionId === activeFileDragSessionRef.current
      ) {
        clearDraggedModels();
      }
    });

    return () => unsubscribe?.();
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(
      EXPANDED_FOLDERS_STORAGE_KEY,
      JSON.stringify([...expandedFolderIds])
    );
  }, [expandedFolderIds]);

  useEffect(() => {
    window.localStorage.setItem(MODEL_VIEW_MODE_STORAGE_KEY, modelViewMode);
  }, [modelViewMode]);

  useEffect(() => {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem(FOLDERS_PINNED_STORAGE_KEY, String(foldersPinned));
  }, [foldersPinned]);

  useEffect(() => {
    if (!undoToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setUndoToast(null), UNDO_TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [undoToast]);

  useEffect(() => {
    if (!operationMessage) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setOperationMessage(null),
      OPERATION_MESSAGE_TIMEOUT_MS
    );
    return () => window.clearTimeout(timeoutId);
  }, [operationMessage]);

  useEffect(() => {
    const models = scanResult?.models ?? [];
    const hashCandidates = getHashCandidateModels(models);
    const expectedSession = activeLibrarySessionRef.current;
    let isStale = false;

    if (
      !settings?.libraryPath ||
      hashCandidates.length === 0 ||
      typeof window.modelLibrary.getModelHashes !== "function"
    ) {
      setModelHashes({});
      return;
    }

    window.modelLibrary
      .getModelHashes(hashCandidates)
      .then((hashes) => {
        if (!isStale && expectedSession &&
          isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) {
          setModelHashes(hashes);
        }
      })
      .catch((error) => {
        if (!isStale && expectedSession &&
          isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) {
          setOperationMessage(readLocalizedErrorMessage(error));
        }
      });

    return () => {
      isStale = true;
    };
  }, [scanResult?.models, settings?.libraryPath]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (closeTopOverlay()) {
          event.preventDefault();
          return;
        }
      }

      if (isTextInputTarget(event.target)) {
        return;
      }

      if (event.key === "Delete" && selectedModelIds.size > 0) {
        event.preventDefault();
        void trashSelectedModels();
        return;
      }

      if (event.key !== "F2") {
        return;
      }

      const target = getRenameTarget({
        lastFocusedItem,
        selectedFolder,
        selectedModelId: selectedModel?.id ?? null
      });

      if (target.type === "none") {
        return;
      }

      event.preventDefault();

      if (target.type === "folder") {
        void renameFolder(target.folderId);
      } else {
        void renameSelectedModel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    folderContextMenu,
    confirmationDialog,
    isSettingsOpen,
    lastFocusedItem,
    modelContextMenu,
    selectedFolder,
    selectedModel,
    selectedModelIds,
    tagPickerDialog,
    textInputDialog,
    responsivePanel
  ]);

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      const intent = getMouseNavigationIntent(event.button);

      if (!intent) {
        return;
      }

      event.preventDefault();

      if (closeTopOverlay()) {
        return;
      }

      if (intent === "back") {
        goBackFolder();
      } else {
        goForwardFolder();
      }
    }

    function preventAuxClickNavigation(event: MouseEvent) {
      if (getMouseNavigationIntent(event.button)) {
        event.preventDefault();
      }
    }

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("auxclick", preventAuxClickNavigation);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("auxclick", preventAuxClickNavigation);
    };
  }, [
    folderContextMenu,
    folderHistory,
    confirmationDialog,
    isSettingsOpen,
    modelContextMenu,
    notesFilter,
    onlyDuplicates,
    onlyFavorites,
    onlySelected,
    searchQuery,
    selectedFolder,
    selectedTagFilters,
    sortMode,
    tagPickerDialog,
    tagMatchMode,
    textInputDialog,
    usageFilter
  ]);

  async function refreshMetadataState() {
    const expectedSession = activeLibrarySessionRef.current;
    if (!expectedSession) return;
    const [nextMetadata, nextStatus] = await Promise.all([
      window.modelLibrary.getLibraryMetadata(),
      window.modelLibrary.getLibraryMetadataStatus()
    ]);
    if (!isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) return;
    setLibraryMetadata(nextMetadata);
    setMetadataStatus(nextStatus);
  }

  async function retryLibraryMetadata() {
    const expectedSession = activeLibrarySessionRef.current;
    if (!expectedSession) return;
    try {
      const nextStatus = await window.modelLibrary.retryLibraryMetadata();
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) return;
      const nextMetadata = await window.modelLibrary.getLibraryMetadata();
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) return;
      setMetadataStatus(nextStatus);
      setLibraryMetadata(nextMetadata);
      setOperationMessage(
        nextStatus.availability === "ready"
          ? t("message.metadataReconnected")
          : nextStatus.message
            ? readLocalizedErrorMessage(new Error(nextStatus.message))
            : t("error.unexpected")
      );
    } catch (error) {
      setOperationMessage(
        t("message.metadataReconnectFailed", { detail: readLocalizedErrorMessage(error) })
      );
    }
  }

  async function chooseFolder() {
    const libraryPath = await window.modelLibrary.chooseLibraryFolder();

    if (!libraryPath || !settings) {
      return;
    }

    await saveSettings((current) => ({ ...current, libraryPath }));
  }

  async function saveSettings(mutation: AppSettingsMutation) {
    if (!settings || !settingsMutationQueueRef.current) return;
    try {
      const savedSettings = await settingsMutationQueueRef.current.enqueue(mutation);
      setSettings(savedSettings);
    } catch (error) {
      setOperationMessage(readLocalizedErrorMessage(error));
    }
  }

  async function persistSettings(nextSettings: AppSettings, previousSettings: AppSettings) {
    const libraryChanged = previousSettings.libraryPath !== nextSettings.libraryPath;
    if (libraryChanged && nextSettings.libraryPath) {
      const activation = await activateLibrary(
        nextSettings.libraryPath,
        nextSettings.monitorLibrary
      );
      if (!activation) return previousSettings;
    }
    const expectedSession = activeLibrarySessionRef.current;
    const savedSettings = await window.modelLibrary.saveSettings(nextSettings);
    if (expectedSession &&
      !isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) {
      return previousSettings;
    }
    const currentSession = activeLibrarySessionRef.current;
    if (!libraryChanged && currentSession) {
      setMonitorStatus(nextSettings.monitorLibrary ? "active" : "disabled");
    }
    return savedSettings;
  }

  function updateFileDragBehavior(fileDragBehavior: FileDragBehavior) {
    if (!settings) return;

    void saveSettings((current) => ({ ...current, fileDragBehavior }));
  }

  async function chooseSlicerExecutable(slicerId: string) {
    if (!settings) {
      return;
    }

    const executablePath = await window.modelLibrary.chooseSlicerExecutable();

    if (!executablePath) {
      return;
    }

    await saveSettings(setSlicerExecutable(slicerId, executablePath));
  }

  async function detectInstalledSlicers() {
    if (isDetectingSlicers) return;
    setIsDetectingSlicers(true);
    try {
      const candidates = await window.modelLibrary.detectSlicers();
      if (candidates.length > 0) await saveSettings(applyDetectedSlicers(candidates));
    } catch (error) {
      setOperationMessage(t("slicer.detectFailed", { detail: readLocalizedErrorMessage(error) }));
    } finally {
      setIsDetectingSlicers(false);
    }
  }

  async function addSlicerProgram() {
    const name = await requestTextInput({
      title: t("slicer.addTitle"), label: t("slicer.customName"),
      confirmLabel: t("common.continue")
    });
    if (!name?.trim()) return;
    try {
      const executablePath = await window.modelLibrary.chooseSlicerExecutable();
      if (executablePath) await saveSettings(addCustomSlicer(name, executablePath));
    } catch (error) {
      setOperationMessage(readLocalizedErrorMessage(error));
    }
  }

  async function renameSlicerProgram(slicerId: string) {
    const slicer = settings?.slicers.find((item) => item.id === slicerId);
    if (!slicer || slicer.kind !== "custom") return;
    const name = await requestTextInput({
      title: t("slicer.renameTitle"), label: t("slicer.customName"),
      initialValue: slicer.name, confirmLabel: t("common.rename")
    });
    if (name?.trim()) await saveSettings(renameCustomSlicer(slicerId, name));
  }

  async function removeSlicerProgram(slicerId: string) {
    const slicer = settings?.slicers.find((item) => item.id === slicerId);
    if (!slicer || slicer.kind !== "custom") return;
    const confirmed = await requestConfirmation({
      title: t("slicer.removeTitle"),
      message: t("slicer.removeQuestion", { name: slicer.name }),
      confirmLabel: t("slicer.remove"), tone: "danger"
    });
    if (confirmed) await saveSettings(removeCustomSlicer(slicerId));
  }

  async function chooseArchiveExtractor() {
    if (!settings) {
      return;
    }

    const archiveExtractorPath = await window.modelLibrary.chooseArchiveExtractor();

    if (!archiveExtractorPath) {
      return;
    }

    await saveSettings((current) => ({ ...current, archiveExtractorPath }));
  }

  async function launchSlicer(slicerId: string, modelPaths: string | string[]) {
    const result = await window.modelLibrary.launchSlicer(slicerId, modelPaths);
    setLaunchMessage(localizeResult(result.message));

    if (result.ok) {
      await refreshMetadataState();
    }
  }

  function getSlicerLaunchModelPaths(contextModel: ModelFile): string[] {
    return getSlicerLaunchFilePaths(
      contextModel,
      scanResult?.models ?? [],
      selectedModelIds
    );
  }

  function getSlicerLaunchModelCount(contextModel: ModelFile): number {
    return getSlicerLaunchModelPaths(contextModel).length;
  }

  async function launchSelectedModelsInSlicer(slicerId: string, contextModel: ModelFile) {
    const modelPaths = getSlicerLaunchModelPaths(contextModel);
    setModelContextMenu(null);

    if (modelPaths.length === 0) {
      setLaunchMessage(t("message.selectSlicerModels"));
      return;
    }

    await launchSlicer(slicerId, modelPaths);
  }

  async function openModelInDefaultSlicer(model: ModelFile) {
    if (!canSendToSlicer(model.extension)) {
      setLaunchMessage(t("message.extractBeforeSlicer"));
      return;
    }

    if (!settings?.defaultSlicerId) {
      setLaunchMessage(t("message.chooseDefaultSlicer"));
      return;
    }

    const defaultSlicer = settings.slicers.find((slicer) => slicer.id === settings.defaultSlicerId);

    if (!defaultSlicer?.enabled || !defaultSlicer.executablePath) {
      setLaunchMessage(t("message.configureDefaultSlicer"));
      return;
    }

    await launchSlicer(settings.defaultSlicerId, model.absolutePath);
  }

  async function openLibraryImageFile(modelPath: string) {
    const session = activeLibrarySessionRef.current;
    if (!session) throw new Error(t("message.libraryInactive"));
    await window.modelLibrary.openLibraryFile(session, modelPath);
  }

  async function openFileByDefault(model: ModelFile) {
    const action = getDefaultFileOpenAction(model.extension);

    if (action === "windows") {
      try {
        await openLibraryImageFile(model.absolutePath);
        setLaunchMessage(null);
      } catch (error) {
        setLaunchMessage(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    if (action === "inspect-archive") {
      setSelectedModel(model);
      setLaunchMessage(null);
      return;
    }

    if (action === "preview") {
      setSelectedModel(model);
      setLaunchMessage(null);
      return;
    }

    await openModelInDefaultSlicer(model);
  }

  async function toggleFavorite(modelPath: string) {
    await persistMetadataMutation(() => window.modelLibrary.toggleFavorite(modelPath));
  }

  async function setModelTags(modelPath: string, tags: string[]) {
    await persistMetadataMutation(() => window.modelLibrary.setModelTags(modelPath, tags));
  }

  async function setModelNotes(modelPath: string, notes: string) {
    await persistMetadataMutation(() => window.modelLibrary.setModelNotes(modelPath, notes));
  }

  async function persistMetadataMutation(operation: () => Promise<LibraryMetadata>) {
    const expectedSession = activeLibrarySessionRef.current;
    if (!expectedSession) return;
    try {
      const nextMetadata = await operation();
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) return;
      const nextStatus = await window.modelLibrary.getLibraryMetadataStatus();
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) return;
      setLibraryMetadata(nextMetadata);
      setMetadataStatus(nextStatus);
    } catch (error) {
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) return;
      const nextStatus = await window.modelLibrary.getLibraryMetadataStatus();
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) return;
      setMetadataStatus(nextStatus);
      setOperationMessage(
        t("message.metadataSaveFailed", { detail: readLocalizedErrorMessage(error) })
      );
    }
  }

  function requestTextInput(options: TextInputDialogOptions): Promise<string | null> {
    setTextInputDialog(options);

    return new Promise((resolve) => {
      textInputResolver.current = resolve;
    });
  }

  function closeTextInputDialog(value: string | null) {
    textInputResolver.current?.(value);
    textInputResolver.current = null;
    setTextInputDialog(null);
  }

  function requestConfirmation(options: ConfirmDialogOptions): Promise<boolean> {
    setConfirmationDialog(options);

    return new Promise((resolve) => {
      confirmationResolver.current = resolve;
    });
  }

  function closeConfirmationDialog(value: boolean) {
    confirmationResolver.current?.(value);
    confirmationResolver.current = null;
    setConfirmationDialog(null);
  }

  function closeTopOverlay(): boolean {
    if (textInputDialog) {
      closeTextInputDialog(null);
      return true;
    }

    if (confirmationDialog) {
      closeConfirmationDialog(false);
      return true;
    }

    if (tagPickerDialog) {
      setTagPickerDialog(null);
      return true;
    }

    if (modelContextMenu) {
      setModelContextMenu(null);
      return true;
    }

    if (folderContextMenu) {
      setFolderContextMenu(null);
      return true;
    }

    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      return true;
    }

    if (responsivePanel) {
      setResponsivePanel(null);
      return true;
    }

    return false;
  }

  async function addCatalogTag() {
    const tag = await requestTextInput({
      title: t("dialog.newTag"),
      label: t("dialog.tagName"),
      placeholder: "ex: cosplay",
      confirmLabel: t("dialog.createTag")
    });

    if (!tag?.trim()) {
      return;
    }

    await persistMetadataMutation(() => window.modelLibrary.addCatalogTag(tag));
  }

  async function removeCatalogTag(tag: string) {
    const confirmed = await requestConfirmation({
      title: t("dialog.deleteTag"),
      message: `Remover a tag "${tag}" da lista e de todos os modelos?`,
      confirmLabel: t("dialog.deleteTag"),
      tone: "danger"
    });

    if (!confirmed) {
      return;
    }

    await persistMetadataMutation(() => window.modelLibrary.removeCatalogTag(tag));
  }

  function toggleTagFilter(tag: string) {
    setSelectedTagFilters((currentTags) => {
      const nextTags = new Set(currentTags);

      if (nextTags.has(tag)) {
        nextTags.delete(tag);
      } else {
        nextTags.add(tag);
      }

      return nextTags;
    });
  }

  function updateLibraryViewPreferences(
    update: (current: LibraryViewPreferencesV1) => LibraryViewPreferencesV1
  ) {
    const expectedSession = activeLibrarySessionRef.current;
    if (!expectedSession) return;

    setLibraryViewPreferences((current) => {
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) return current;
      const next = update(current ?? loadLibraryViewPreferences(
        window.localStorage,
        expectedSession.libraryId
      ));
      saveLibraryViewPreferences(window.localStorage, expectedSession.libraryId, next);
      return next;
    });
  }

  function updateVisibleExtensions(visibleExtensions: ReadonlySet<SupportedFileExtension>) {
    updateLibraryViewPreferences((current) => ({
      ...current,
      visibleExtensions: [...SUPPORTED_FILE_EXTENSIONS].filter((extension) =>
        visibleExtensions.has(extension)
      )
    }));
  }

  function excludeFolder(folderId: string) {
    setFolderContextMenu(null);
    if (folderId === ALL_FOLDERS_ID) return;

    updateLibraryViewPreferences((current) => ({
      ...current,
      excludedFolders: [...new Set([...current.excludedFolders, folderId])]
    }));
  }

  function removeFolderExclusion(folderId: string) {
    updateLibraryViewPreferences((current) => ({
      ...current,
      excludedFolders: current.excludedFolders.filter((excluded) => excluded !== folderId)
    }));
  }

  function clearFolderExclusions() {
    updateLibraryViewPreferences((current) => ({
      ...current,
      excludedFolders: []
    }));
  }

  async function activateLibrary(rootPath: string, monitoring: boolean) {
    const requestId = ++activationRequestRef.current;
    const previousSession = activeLibrarySessionRef.current;
    const previousRendererState = {
      session: previousSession,
      scanResult,
      selectedModel,
      selectedModelIds: new Set(selectedModelIds),
      lastSelectedModelId,
      selectedFolder,
      folderHistory,
      scrollTop: gridScrollTopRef.current,
      draggedModelIds: [...draggedModelIds],
      activeFileDragSessionId: activeFileDragSessionRef.current,
      searchQuery,
      folderContextMenu,
      modelContextMenu,
      libraryMetadata,
      metadataStatus,
      libraryViewPreferences,
      monitorStatus,
      actionLogEntries: [...actionLogEntries],
      undoToast
    };

    activeLibrarySessionRef.current = null;
    applyLibraryReset();

    try {
      const activation = await window.modelLibrary.activateLibrary(rootPath, monitoring);
      if (activationRequestRef.current !== requestId || !activation) return null;

      activeLibrarySessionRef.current = activation.session;
      modelThumbnailService.beginLibrarySession(activation.session);
      setLibraryViewPreferences(
        loadLibraryViewPreferences(window.localStorage, activation.session.libraryId)
      );
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, activation.session)) return null;
      setLibraryMetadata(activation.metadata);
      setMetadataStatus(activation.metadataStatus);
      setScanResult(activation.cachedResult);
      setMonitorStatus(monitoring ? "active" : "disabled");
      setMonitoringError(null);
      void scanLibrarySession(activation.session);
      return activation;
    } catch (error) {
      if (activationRequestRef.current !== requestId) return null;
      await restorePreviousLibrary(previousRendererState, requestId);
      if (activationRequestRef.current === requestId) {
        setOperationMessage(readLocalizedErrorMessage(error));
      }
      return null;
    }
  }

  function applyLibraryReset() {
    const reset = createLibrarySessionResetState();
    setScanResult(reset.scanResult);
    setSelectedModel(reset.selectedModel);
    setSelectedModelIds(reset.selectedModelIds);
    setLastSelectedModelId(reset.lastSelectedModelId);
    setSelectedFolder(reset.selectedFolder);
    setFolderHistory(reset.folderHistory);
    requestGridScroll(0);
    draggedModelIdsRef.current = reset.draggedModelIds;
    activeFileDragSessionRef.current = reset.activeFileDragSessionId;
    setDraggedModelIds(reset.draggedModelIds);
    setSearchQuery(reset.searchQuery);
    setFolderContextMenu(reset.folderContextMenu);
    setModelContextMenu(reset.modelContextMenu);
    setTagPickerDialog(null);
    setThumbnailRetryGenerations({});
    setModelRevealRequest(null);
    setModelHashes({});
    setActionLogEntries([]);
    setUndoToast(null);
    setLibraryViewPreferences(null);
    setLibraryMetadata({ models: {}, tagCatalog: [], slicerHistory: [] });
    setMetadataStatus({
      availability: "unavailable",
      writable: false,
      source: "empty",
      message: t("message.libraryNotConnected")
    });
    setMonitorStatus("disabled");
    setMonitoringError(null);
    setVerifiedHealthScan(null);
    setHealthCheckedAt(null);
    librarySessionIssueRegistry.reset();
  }

  async function verifyLibraryHealth() {
    const session = activeLibrarySessionRef.current;
    if (!session) throw new Error(t("error.libraryInactive"));
    const [verified, unavailable] = await Promise.all([
      window.modelLibrary.verifyLibrary(session),
      window.modelLibrary.inspectConfiguredSlicers()
    ]);
    if (!isCurrentLibraryResult(activeLibrarySessionRef.current, verified.session)) return null;
    setVerifiedHealthScan(verified.result);
    setUnavailableSlicerIds(unavailable);
    setHealthCheckedAt(new Date().toISOString());
    return verified.result;
  }

  async function restorePreviousLibrary(
    previous: {
      session: LibrarySessionRef | null;
      scanResult: LibraryScanResult | null;
      selectedModel: ModelFile | null;
      selectedModelIds: Set<string>;
      lastSelectedModelId: string | null;
      selectedFolder: string;
      folderHistory: ReturnType<typeof createFolderNavigationHistory>;
      scrollTop: number;
      draggedModelIds: string[];
      activeFileDragSessionId: string | null;
      searchQuery: string;
      folderContextMenu: typeof folderContextMenu;
      modelContextMenu: typeof modelContextMenu;
      libraryMetadata: LibraryMetadata;
      metadataStatus: LibraryMetadataStatus;
      libraryViewPreferences: LibraryViewPreferencesV1 | null;
      monitorStatus: typeof monitorStatus;
      actionLogEntries: LocalActionLogEntry[];
      undoToast: LocalActionLogEntry | null;
    },
    requestId: number
  ) {
    try {
      const restored = await window.modelLibrary.getCurrentLibrary();
      if (activationRequestRef.current !== requestId || !restored) return;

      activeLibrarySessionRef.current = restored.session;
      modelThumbnailService.beginLibrarySession(restored.session);
      const isPriorRoot = previous.session && samePath(
        previous.session.rootPath,
        restored.session.rootPath
      );
      setScanResult(restored.cachedResult);
      setSelectedModel(isPriorRoot ? previous.selectedModel : null);
      setSelectedModelIds(isPriorRoot ? previous.selectedModelIds : new Set());
      setLastSelectedModelId(isPriorRoot ? previous.lastSelectedModelId : null);
      setSelectedFolder(isPriorRoot ? previous.selectedFolder : ALL_FOLDERS_ID);
      setFolderHistory(
        isPriorRoot ? previous.folderHistory : createFolderNavigationHistory()
      );
      requestGridScroll(isPriorRoot ? previous.scrollTop : 0);
      draggedModelIdsRef.current = [];
      activeFileDragSessionRef.current = null;
      setDraggedModelIds([]);
      setSearchQuery(isPriorRoot ? previous.searchQuery : "");
      setFolderContextMenu(null);
      setModelContextMenu(null);
      setActionLogEntries(isPriorRoot ? previous.actionLogEntries : []);
      setUndoToast(isPriorRoot ? previous.undoToast : null);
      setLibraryViewPreferences(
        loadLibraryViewPreferences(window.localStorage, restored.session.libraryId)
      );
      setLibraryMetadata(restored.metadata);
      setMetadataStatus(restored.metadataStatus);
      setMonitorStatus(isPriorRoot ? previous.monitorStatus : "disabled");
      void scanLibrarySession(restored.session);
    } catch (restoreError) {
      if (activationRequestRef.current === requestId) {
        setOperationMessage(readLocalizedErrorMessage(restoreError));
      }
    }
  }

  async function scanLibrarySession(
    session: LibrarySessionRef,
    preferredSelectedPaths: string[] = []
  ) {
    if (!isCurrentLibraryResult(activeLibrarySessionRef.current, session)) return null;
    setIsScanning(true);

    try {
      const versionedResult = await window.modelLibrary.scanLibrary(session);
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, versionedResult.session)) {
        return null;
      }
      const nextScanResult = versionedResult.result;
      setScanResult(nextScanResult);
      setVerifiedHealthScan(null);
      setHealthCheckedAt(null);
      const modelsByPath = new Map(
        nextScanResult.models.map((model) => [model.absolutePath.toLowerCase(), model])
      );

      if (preferredSelectedPaths.length > 0) {
        const preferredModels = preferredSelectedPaths
          .map((modelPath) => modelsByPath.get(modelPath.toLowerCase()))
          .filter((model): model is ModelFile => Boolean(model));

        setSelectedModelIds(new Set(preferredModels.map((model) => model.id)));
        setSelectedModel(preferredModels[0] ?? null);
        setLastSelectedModelId(preferredModels[0]?.id ?? null);
      } else {
        setSelectedModelIds((currentIds) => {
          const nextIds = new Set<string>();

          for (const model of nextScanResult.models) {
            if (currentIds.has(model.id)) {
              nextIds.add(model.id);
            }
          }

          return nextIds;
        });

        setSelectedModel((currentModel) => {
          if (!currentModel) {
            return null;
          }

          return nextScanResult.models.find((model) => model.id === currentModel.id) ?? null;
        });
      }

      return nextScanResult;
    } catch (error) {
      if (isCurrentLibraryResult(activeLibrarySessionRef.current, session)) {
        setOperationMessage(readLocalizedErrorMessage(error));
      }
      return null;
    } finally {
      if (isCurrentLibraryResult(activeLibrarySessionRef.current, session)) {
        setIsScanning(false);
      }
    }
  }

  function scanCurrentLibrary(preferredSelectedPaths: string[] = []) {
    const currentSession = activeLibrarySessionRef.current;
    return currentSession
      ? scanLibrarySession(currentSession, preferredSelectedPaths)
      : Promise.resolve(null);
  }

  function selectFolder(folderId: string) {
    if (folderId === selectedFolder) {
      navigateToFolder(folderId);
      return;
    }
    const currentEntry = captureCurrentNavigationEntry();
    setFolderHistory((currentHistory) =>
      pushFolderHistory(currentHistory, currentEntry, folderId)
    );
    navigateToFolder(folderId);
    requestGridScroll(0);
  }

  function navigateToFolder(folderId: string) {
    setLastFocusedItem("folder");
    setFolderContextMenu(null);
    setModelContextMenu(null);
    setSelectedFolder(folderId);
    setResponsivePanel(null);
    expandFolderAncestors(folderId);
  }

  function goBackFolder() {
    const result = goBackInFolderHistory(folderHistory, captureCurrentNavigationEntry());

    if (!result) {
      return;
    }

    setFolderHistory(result.history);
    restoreNavigationEntry(result.entry);
  }

  function goForwardFolder() {
    const result = goForwardInFolderHistory(folderHistory, captureCurrentNavigationEntry());

    if (!result) {
      return;
    }

    setFolderHistory(result.history);
    restoreNavigationEntry(result.entry);
  }

  function captureCurrentNavigationEntry(): FolderNavigationEntry {
    return createFolderNavigationEntry(selectedFolder, {
      searchQuery,
      sortMode,
      onlySelected,
      onlyFavorites,
      onlyDuplicates,
      usageFilter,
      notesFilter,
      tagMatchMode,
      selectedTags: [...selectedTagFilters],
      scrollTop: gridScrollTopRef.current
    });
  }

  function restoreNavigationEntry(entry: FolderNavigationEntry) {
    navigateToFolder(entry.folderId);
    setSearchQuery(entry.searchQuery);
    setSortMode(entry.sortMode);
    setOnlySelected(entry.onlySelected);
    setOnlyFavorites(entry.onlyFavorites);
    setOnlyDuplicates(entry.onlyDuplicates);
    setUsageFilter(entry.usageFilter);
    setNotesFilter(entry.notesFilter);
    setTagMatchMode(entry.tagMatchMode);
    setSelectedTagFilters(new Set(entry.selectedTags));
    requestGridScroll(entry.scrollTop);
  }

  function requestGridScroll(top: number) {
    gridScrollTopRef.current = top;
    gridScrollRestoreSequenceRef.current += 1;
    setGridScrollRestoreRequest({ key: gridScrollRestoreSequenceRef.current, top });
  }

  function openFolderContextMenu(folderId: string, x: number, y: number) {
    setLastFocusedItem("folder");
    setModelContextMenu(null);
    expandFolderAncestors(folderId);
    setFolderContextMenu({ folderId, x, y });
  }

  async function showFolderInExplorer(folderId: string) {
    const session = activeLibrarySessionRef.current;
    if (!session) {
      flushSync(() => setFolderContextMenu(null));
      setOperationMessage(t("message.libraryInactive"));
      return;
    }

    const relativeFolder = folderId === ALL_FOLDERS_ID ? "" : folderId;
    try {
      await runAfterCommittedUpdate(
        () => setFolderContextMenu(null),
        () => window.modelLibrary.showLibraryFolder(session, relativeFolder)
      );
      if (isCurrentLibraryResult(activeLibrarySessionRef.current, session)) {
        setOperationMessage(relativeFolder ? t("message.folderOpenedExplorer") : t("message.libraryOpenedExplorer"));
      }
    } catch (error) {
      if (isCurrentLibraryResult(activeLibrarySessionRef.current, session)) {
        setOperationMessage(readLocalizedErrorMessage(error));
      }
    }
  }

  async function copyCurrentFolderPath() {
    const folderId = selectedFolder === ALL_FOLDERS_ID ? "" : selectedFolder;

    try {
      await window.modelLibrary.copyText(buildFolderPath(settings?.libraryPath ?? "", folderId));
      setOperationMessage(t("message.folderPathCopied"));
    } catch (error) {
      setOperationMessage(readLocalizedErrorMessage(error));
    }
  }

  function toggleExpandedFolder(folderId: string) {
    setExpandedFolderIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(folderId)) {
        nextIds.delete(folderId);
      } else {
        nextIds.add(folderId);
      }

      return nextIds;
    });
  }

  function expandAllFolders() {
    setExpandedFolderIds(new Set(getAllFolderIds(folders)));
  }

  function collapseAllFolders() {
    setExpandedFolderIds(new Set());
  }

  function expandFolderAncestors(folderId: string) {
    if (folderId === ALL_FOLDERS_ID) {
      return;
    }

    const ancestorIds = getAncestorFolderIds(folderId);
    setExpandedFolderIds((currentIds) => new Set([...currentIds, ...ancestorIds]));
  }

  function openModel(model: ModelFile, modifiers: { ctrlKey: boolean; shiftKey: boolean }) {
    setLastFocusedItem("model");
    setFolderContextMenu(null);
    setModelContextMenu(null);
    const result = updateSelectionForGesture({
      orderedIds: filteredModels.map((item) => item.id),
      selectedIds: selectedModelIds,
      clickedId: model.id,
      lastSelectedId: lastSelectedModelId,
      ctrlKey: modifiers.ctrlKey,
      shiftKey: modifiers.shiftKey
    });

    setSelectedModel(model);
    setSelectedModelIds(result.selectedIds);
    setLastSelectedModelId(result.lastSelectedId);
  }

  function openModelContextMenu(model: ModelFile, x: number, y: number) {
    setLastFocusedItem("model");
    setFolderContextMenu(null);
    setModelContextMenu({ model, x, y });

    if (!selectedModelIds.has(model.id)) {
      setSelectedModel(model);
      setSelectedModelIds(new Set([model.id]));
      setLastSelectedModelId(model.id);
    }
  }

  function loadModelPreviewInPanel(model: ModelFile) {
    setLastFocusedItem("model");
    setModelContextMenu(null);
    setSelectedModel(model);
    setSelectedModelIds(new Set([model.id]));
    setLastSelectedModelId(model.id);
    setResponsivePanel("details");
    modelPreviewRequestIdRef.current += 1;
    setModelPreviewRequest({
      id: modelPreviewRequestIdRef.current,
      modelPath: model.absolutePath
    });
  }

  function viewModelFolderInLibrary(model: ModelFile) {
    setModelContextMenu(null);
    setSearchQuery("");
    setOnlySelected(false);
    setOnlyFavorites(false);
    setOnlyDuplicates(false);
    setUsageFilter("all");
    setNotesFilter("all");
    setTagMatchMode("all");
    setSelectedTagFilters(new Set());
    setSelectedModel(model);
    setSelectedModelIds(new Set([model.id]));
    setLastSelectedModelId(model.id);
    updateLibraryViewPreferences((current) => ({
      ...current,
      visibleExtensions: [...new Set([...current.visibleExtensions, model.extension])],
      excludedFolders: current.excludedFolders.filter((excluded) =>
        !isFolderExcluded(model.relativeFolder, [excluded])
      )
    }));
    selectFolder(model.relativeFolder || ALL_FOLDERS_ID);
    modelRevealSequenceRef.current += 1;
    setModelRevealRequest({ key: modelRevealSequenceRef.current, modelId: model.id });
  }

  async function retryModelThumbnail(model: ModelFile) {
    setModelContextMenu(null);
    try {
      await modelThumbnailService.retry(model);
      setThumbnailRetryGenerations((current) => ({
        ...current,
        [model.absolutePath]: (current[model.absolutePath] ?? 0) + 1
      }));
    } catch (error) {
      setOperationMessage(readLocalizedErrorMessage(error));
    }
  }

  function toggleModelSelection(model: ModelFile, selected: boolean) {
    setLastFocusedItem("model");
    setFolderContextMenu(null);
    setModelContextMenu(null);
    setSelectedModel(model);
    setLastSelectedModelId(model.id);
    setSelectedModelIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (selected) {
        nextIds.add(model.id);
      } else {
        nextIds.delete(model.id);
      }

      return nextIds;
    });
  }

  function startDraggingModel(model: ModelFile, mode: "external" | "internal") {
    const ids = getDragModelIds(model, models, selectedModelIds);
    const filePaths = getDragOutFilePaths(model, models, selectedModelIds);
    const internalDragIds = mode === "internal" ? ids : [];

    if (filePaths.length === 0) {
      return;
    }

    const sessionId = createFileDragSessionId();
    draggedModelIdsRef.current = internalDragIds;
    activeFileDragSessionRef.current = sessionId;
    setOperationMessage(
      mode === "internal"
        ? t("message.organizingFiles", { count: filePaths.length })
        : t("message.draggingFiles", { count: filePaths.length })
    );

    flushSync(() => {
      setLastFocusedItem("model");
      setFolderContextMenu(null);
      setModelContextMenu(null);
      setDraggedModelIds(internalDragIds);

      if (!selectedModelIds.has(model.id)) {
        setSelectedModelIds(new Set([model.id]));
        setSelectedModel(model);
        setLastSelectedModelId(model.id);
      }
    });
    if (mode === "external") {
      window.modelLibrary.startFileDrag({ sessionId, filePaths });
    }
  }

  function clearDraggedModels() {
    activeFileDragSessionRef.current = null;
    draggedModelIdsRef.current = [];
    setDraggedModelIds([]);
  }

  async function createFolder(parentFolderOverride?: string) {
    setFolderContextMenu(null);
    setModelContextMenu(null);

    if (!settings?.libraryPath) {
      return;
    }

    const parentFolderId = parentFolderOverride ?? selectedFolder;
    const parentFolder = parentFolderId === ALL_FOLDERS_ID ? "" : parentFolderId;
    const folderName = await requestTextInput({
      title: parentFolder
        ? t("dialog.newFolderAt", { name: parentFolder })
        : t("dialog.newRootFolder"),
      label: t("dialog.folderName"),
      confirmLabel: t("dialog.createFolder")
    });

    if (!folderName?.trim()) {
      return;
    }

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.createFolder(parentFolder, folderName);
      selectFolder(joinFolder(parentFolder, folderName.trim()));
      return {
        message: localizeResult(result.message),
        selectedPaths: [],
        preserveScroll: false,
        action: createActionLogEntry(t("action.folderCreated"), joinFolder(parentFolder, folderName.trim()))
      };
    });
  }

  async function renameFolder(folderId = selectedFolder) {
    setFolderContextMenu(null);
    setModelContextMenu(null);

    if (!settings?.libraryPath || folderId === ALL_FOLDERS_ID) {
      setOperationMessage(t("message.selectFolderRename"));
      return;
    }

    const currentName = folderId.split("/").pop() ?? folderId;
    const nextName = await requestTextInput({
      title: t("dialog.renameFolder"),
      label: t("dialog.newFolderName"),
      initialValue: currentName,
      confirmLabel: t("common.rename")
    });

    if (!nextName?.trim()) {
      return;
    }

    const parentFolder = folderId.split("/").slice(0, -1).join("/");

    const sourcePath = buildFolderPath(settings.libraryPath, folderId);
    const destinationLabel = joinFolder(parentFolder, nextName.trim());

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.renameFolder(folderId, nextName);
      const nextPath = result.path ?? buildFolderPath(settings.libraryPath ?? "", destinationLabel);
      const restorePairs = createRenameRestorePairs(nextPath, sourcePath);
      selectFolder(destinationLabel);
      return {
        message: localizeResult(result.message),
        selectedPaths: [],
        preserveScroll: false,
        action:
          restorePairs.length > 0
            ? createActionLogEntry(t("action.folderRenamed"), `${folderId} -> ${destinationLabel}`, restorePairs)
            : undefined
      };
    });
  }

  async function moveFolder(folderId = selectedFolder) {
    setFolderContextMenu(null);
    setModelContextMenu(null);

    if (!settings?.libraryPath || folderId === ALL_FOLDERS_ID) {
      setOperationMessage(t("message.selectFolderMove"));
      return;
    }

    const folderName = folderId.split("/").pop() ?? folderId;
    const destinationFolder = await requestTextInput({
      title: t("dialog.moveFolder", { name: folderName }),
      label: t("dialog.destinationFolder"),
      placeholder: t("dialog.destinationFolderPlaceholder"),
      confirmLabel: t("dialog.move")
    });

    if (destinationFolder === null) {
      return;
    }

    const targetFolder = normalizeFolderInput(destinationFolder);
    const sourcePath = buildFolderPath(settings.libraryPath, folderId);
    const destinationLabel = joinFolder(targetFolder, folderName);

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.moveFolder(folderId, targetFolder);
      const movedPath = result.path ?? buildFolderPath(settings.libraryPath ?? "", destinationLabel);
      const restorePairs = samePath(movedPath, sourcePath)
        ? []
        : [{ sourcePath: movedPath, destinationPath: sourcePath }];

      selectFolder(destinationLabel);

      return {
        message: localizeResult(result.message),
        selectedPaths: [],
        preserveScroll: false,
        action:
          restorePairs.length > 0
            ? createActionLogEntry(t("action.folderMoved"), `${folderId} -> ${destinationLabel}`, restorePairs)
            : undefined
      };
    });
  }

  async function trashFolder(folderId = selectedFolder) {
    setFolderContextMenu(null);
    setModelContextMenu(null);

    if (!settings?.libraryPath || folderId === ALL_FOLDERS_ID) {
      setOperationMessage(t("message.selectFolderTrash"));
      return;
    }

    const folderName = folderId.split("/").pop() ?? folderId;
    const confirmed = await requestConfirmation({
      title: t("dialog.trashFolder"),
      message: t("dialog.trashFolderQuestion", { name: folderName }),
      confirmLabel: t("dialog.moveToTrash"),
      tone: "danger"
    });

    if (!confirmed) {
      return;
    }

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.trashFolder(folderId);
      selectFolder(ALL_FOLDERS_ID);

      return {
        message: localizeResult(result.message),
        selectedPaths: [],
        preserveScroll: false,
        action: createActionLogEntry(t("action.folderTrashed"), folderId)
      };
    });
  }

  async function renameSelectedModel() {
    setModelContextMenu(null);

    if (!selectedModel || !settings?.libraryPath) {
      return;
    }

    const nextName = await requestTextInput({
      title: t("dialog.renameFile"),
      label: t("dialog.newFileName"),
      initialValue: selectedModel.name,
      confirmLabel: t("common.rename")
    });

    if (!nextName?.trim()) {
      return;
    }

    const previousPath = selectedModel.absolutePath;

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.renameModelFile(selectedModel.absolutePath, nextName);
      const restorePairs = result.path
        ? createRenameRestorePairs(result.path, previousPath)
        : [];
      return {
        message: localizeResult(result.message),
        selectedPaths: result.path ? [result.path] : [],
        action:
          restorePairs.length > 0
            ? createActionLogEntry(t("action.fileRenamed"), `${selectedModel.name} -> ${nextName}`, restorePairs)
            : undefined
      };
    });
  }

  async function moveDraggedModels(destinationFolder: string) {
    const modelIds = draggedModelIdsRef.current;

    if (!settings?.libraryPath || modelIds.length === 0) {
      return;
    }

    await moveModelsToFolderByIds(modelIds, destinationFolder);
  }

  async function moveSelectedModelsToFolder(destinationFolder: string) {
    setFolderContextMenu(null);
    setModelContextMenu(null);

    if (selectedModelIds.size === 0) {
      return;
    }

    await moveModelsToFolderByIds([...selectedModelIds], destinationFolder);
  }

  async function moveModelsToFolderByIds(modelIds: string[], destinationFolder: string) {
    if (!settings?.libraryPath || modelIds.length === 0) {
      return;
    }

    const modelIdSet = new Set(modelIds);
    const modelsToMove = models.filter((model) => modelIdSet.has(model.id));

    if (modelsToMove.length === 0) {
      return;
    }

    await runLibraryOperation(async () => {
      const targetFolder = destinationFolder === ALL_FOLDERS_ID ? "" : destinationFolder;
      const restorePairs = modelsToMove
        .map((model) => ({
          sourcePath: buildMovedModelPath(settings.libraryPath ?? "", targetFolder, model.name),
          destinationPath: model.absolutePath
        }))
        .filter((pair) => !samePath(pair.sourcePath, pair.destinationPath));
      const result = await window.modelLibrary.moveModels(
        modelsToMove.map((model) => model.absolutePath),
        targetFolder
      );

      return {
        message: localizeResult(result.message),
        selectedPaths: restorePairs.map((pair) => pair.sourcePath),
        action:
          restorePairs.length > 0
            ? createActionLogEntry(
                t("action.modelsMoved"),
                t("action.modelsMovedDetail", {
                  count: restorePairs.length,
                  folder: targetFolder || t("common.root")
                }),
                restorePairs
              )
            : undefined
      };
    });
  }

  async function trashSelectedModels() {
    setFolderContextMenu(null);
    setModelContextMenu(null);

    if (!settings?.libraryPath || selectedModelIds.size === 0) {
      return;
    }

    const selectedIdSet = new Set(selectedModelIds);
    const modelsToTrash = models.filter((model) => selectedIdSet.has(model.id));

    if (modelsToTrash.length === 0) {
      return;
    }

    const confirmed = await requestConfirmation({
      title: t("dialog.trashFiles"),
      message: t("dialog.trashFilesQuestion", { count: modelsToTrash.length }),
      confirmLabel: t("dialog.moveToTrash"),
      tone: "danger"
    });

    if (!confirmed) {
      return;
    }

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.trashModels(
        modelsToTrash.map((model) => model.absolutePath)
      );

      return {
        message: localizeResult(result.message),
        selectedPaths: [],
        action: createActionLogEntry(
          t("action.modelsTrashed"),
          t("action.fileCount", { count: modelsToTrash.length })
        )
      };
    });
  }

  async function extractArchiveFile(archivePath: string, mode: ArchiveExtractionMode) {
    if (!settings?.libraryPath) {
      return;
    }

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.extractArchive(archivePath, mode);

      return {
        message: localizeResult(result.message),
        selectedPaths: result.paths ?? []
      };
    });
  }

  async function convertSelectedThreeMfToStl(
    modelPath: string,
    onProgress: (progress: number) => void
  ) {
    if (!settings?.libraryPath) {
      return;
    }

    await runLibraryOperation(async () => {
      const modelBytes = await window.modelLibrary.readModelFile(modelPath);
      const stlContent = await convertThreeMfToStlInWorker(modelBytes, onProgress);
      const result = await window.modelLibrary.saveConvertedStl(modelPath, stlContent);

      return {
        message: localizeResult(result.message),
        selectedPaths: result.paths ?? []
      };
    });
  }

  async function convertContextModelToStl(model: ModelFile) {
    setModelContextMenu(null);
    await convertSelectedThreeMfToStl(model.absolutePath, (progress) => {
      setOperationMessage(`${t("details.converting")} ${progress}%`);
    });
  }

  async function undoLastAction() {
    setFolderContextMenu(null);
    setModelContextMenu(null);

    if (!settings?.libraryPath) {
      return;
    }

    const undoableAction = actionLogEntries.find(
      (entry) => entry.undoable && !entry.undone && entry.restorePairs?.length
    );

    if (!undoableAction?.restorePairs?.length) {
      return;
    }

    const expectedSession = activeLibrarySessionRef.current;
    if (!expectedSession) return;
    const preservedScrollTop = gridScrollTopRef.current;

    try {
      const result = await window.modelLibrary.restoreLibraryPaths(undoableAction.restorePairs);
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) return;
      setActionLogEntries((entries) => markActionUndone(entries, undoableAction.id));
      setUndoToast(null);
      setOperationMessage(localizeResult(result.message));
      const nextMetadata = await window.modelLibrary.getLibraryMetadata();
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) return;
      setLibraryMetadata(nextMetadata);
      await scanLibrarySession(expectedSession, result.paths ?? []);
      requestGridScroll(preservedScrollTop);
    } catch (error) {
      if (isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) {
        setOperationMessage(readLocalizedErrorMessage(error));
      }
    }
  }

  async function runLibraryOperation(
    operation: () => Promise<{
      message: string;
      selectedPaths: string[];
      action?: LocalActionLogEntry;
      preserveScroll?: boolean;
    }>
  ) {
    if (!settings?.libraryPath) {
      return;
    }

    const expectedSession = activeLibrarySessionRef.current;
    if (!expectedSession) return;
    const preservedScrollTop = gridScrollTopRef.current;

    try {
      const result = await operation();
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) return;
      setOperationMessage(localizeResult(result.message));
      if (result.action) {
        setActionLogEntries((entries) => appendActionLogEntry(entries, result.action!));
        setUndoToast(result.action);
      }
      const nextMetadata = await window.modelLibrary.getLibraryMetadata();
      if (!isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) return;
      setLibraryMetadata(nextMetadata);
      await scanLibrarySession(expectedSession, result.selectedPaths);
      if (result.preserveScroll !== false) requestGridScroll(preservedScrollTop);
    } catch (error) {
      if (isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) {
        setOperationMessage(readLocalizedErrorMessage(error));
      }
    } finally {
      if (isCurrentLibraryResult(activeLibrarySessionRef.current, expectedSession)) {
        clearDraggedModels();
      }
    }
  }

  async function updateIncludeSubfolders(includeSubfolders: boolean) {
    if (!settings) {
      return;
    }

    await saveSettings((current) => ({ ...current, includeSubfolders }));
  }

  const models = scanResult?.models ?? [];
  const visibleExtensions = useMemo(
    () => new Set<SupportedFileExtension>(
      libraryViewPreferences?.visibleExtensions ?? SUPPORTED_FILE_EXTENSIONS
    ),
    [libraryViewPreferences?.visibleExtensions]
  );
  const excludedFolders = libraryViewPreferences?.excludedFolders ?? [];
  const excludedFolderIds = useMemo(
    () => new Set((scanResult?.folders ?? []).filter((folder) =>
      isFolderExcluded(folder, excludedFolders)
    )),
    [excludedFolders, scanResult?.folders]
  );
  const folders = useMemo(
    () => buildFolderTree(models, scanResult?.folders ?? []),
    [models, scanResult?.folders]
  );
  const includeSubfolders = settings?.includeSubfolders ?? true;
  const folderCards = useMemo(
    () => getGridFolderCards(folders, models, selectedFolder, includeSubfolders, {
      visibleExtensions,
      excludedFolders
    }),
    [excludedFolders, folders, includeSubfolders, models, selectedFolder, visibleExtensions]
  );
  const availableTags = useMemo(
    () => getAvailableTags(models, libraryMetadata),
    [libraryMetadata, models]
  );
  const duplicateModelIds = useMemo(
    () => getDuplicateModelIds(models, modelHashes),
    [modelHashes, models]
  );
  const enabledSlicers = useMemo(
    () => (settings?.slicers ?? []).filter((slicer) => slicer.enabled && slicer.executablePath),
    [settings?.slicers]
  );
  const scopeModels = useMemo(
    () => getFolderScopeModels(models, selectedFolder, includeSubfolders),
    [includeSubfolders, models, selectedFolder]
  );
  const filteredModels = useMemo(
    () =>
      filterModels(models, selectedFolder, includeSubfolders, deferredSearchQuery, {
        visibleExtensions,
        excludedFolders,
        sort: sortMode,
        onlySelected,
        selectedIds: selectedModelIds,
        onlyDuplicates,
        duplicateIds: duplicateModelIds,
        onlyFavorites,
        selectedTags: [...selectedTagFilters],
        usageFilter,
        notesFilter,
        tagMatchMode,
        slicerHistory: libraryMetadata.slicerHistory,
        metadataByPath: libraryMetadata.models
      }),
    [
      deferredSearchQuery,
      duplicateModelIds,
      excludedFolders,
      includeSubfolders,
      libraryMetadata,
      models,
      onlyDuplicates,
      onlyFavorites,
      onlySelected,
      notesFilter,
      selectedFolder,
      selectedModelIds,
      selectedTagFilters,
      sortMode,
      tagMatchMode,
      usageFilter,
      visibleExtensions
    ]
  );

  useEffect(() => {
    if (!scanResult || !libraryViewPreferences) return;
    const reconciled = reconcileExcludedFolders(
      libraryViewPreferences.excludedFolders,
      scanResult.folders
    );
    if (sameStrings(reconciled, libraryViewPreferences.excludedFolders)) return;

    updateLibraryViewPreferences((current) => ({
      ...current,
      excludedFolders: reconcileExcludedFolders(current.excludedFolders, scanResult.folders)
    }));
  }, [libraryViewPreferences, scanResult]);

  if (isLoading) {
    return (
      <main className="first-run" data-theme={themeMode}>
        <div>
          <p className="eyebrow">{t("app.loading")}</p>
          <h1>{t("app.preparingLibrary")}</h1>
        </div>
      </main>
    );
  }

  if (!settings?.libraryPath) {
    return (
      <I18nProvider locale={settings?.locale ?? "pt-BR"}>
        <FirstRun onChooseFolder={chooseFolder} themeMode={themeMode} />
      </I18nProvider>
    );
  }

  const canLaunchContextModelInSlicer = modelContextMenu
    ? getSlicerLaunchModelCount(modelContextMenu.model) > 0
    : false;

  return (
    <I18nProvider locale={settings.locale}>
    <main
      className="app-shell"
      data-theme={themeMode}
      data-responsive-panel={responsivePanel ?? "none"}
      data-folders-pinned={foldersPinned ? "true" : "false"}
    >
      <FolderTree
        folders={folders}
        selectedFolder={selectedFolder}
        includeSubfolders={settings.includeSubfolders}
        modelCount={models.length}
        selectedModelCount={selectedModelIds.size}
        canMoveModels={draggedModelIds.length > 0}
        pointerDragOverFolder={null}
        expandedFolderIds={expandedFolderIds}
        excludedFolderIds={excludedFolderIds}
        onSelectFolder={selectFolder}
        onToggleFolder={toggleExpandedFolder}
        onExpandAllFolders={expandAllFolders}
        onCollapseAllFolders={collapseAllFolders}
        onToggleIncludeSubfolders={updateIncludeSubfolders}
        onOpenFolderContextMenu={openFolderContextMenu}
        onMoveModelsToFolder={moveDraggedModels}
        foldersPinned={foldersPinned}
        onToggleFoldersPinned={() => {
          setFoldersPinned((current) => !current);
          setResponsivePanel(null);
        }}
      />
      <ModelGrid
        models={filteredModels}
        scopeModelCount={scopeModels.length}
        thumbnailModels={models}
        folderCards={folderCards}
        scanErrors={scanResult?.errors ?? []}
        selectedModelId={selectedModel?.id ?? null}
        selectedModelIds={selectedModelIds}
        searchQuery={searchQuery}
        visibleExtensions={visibleExtensions}
        excludedFolders={excludedFolders}
        sortMode={sortMode}
        onlySelected={onlySelected}
        onlyFavorites={onlyFavorites}
        onlyDuplicates={onlyDuplicates}
        usageFilter={usageFilter}
        notesFilter={notesFilter}
        tagMatchMode={tagMatchMode}
        availableTags={availableTags}
        selectedTags={selectedTagFilters}
        metadataByPath={libraryMetadata.models}
        duplicateModelIds={duplicateModelIds}
        thumbnailRetryGenerations={thumbnailRetryGenerations}
        thumbnailDiagnostics={thumbnailDiagnostics}
        isScanning={isScanning}
        monitorStatus={monitorStatus}
        isFilteringStale={isFilteringStale}
        canMoveModels={draggedModelIds.length > 0}
        pointerDragOverFolder={null}
        operationMessage={operationMessage}
        selectedFolder={selectedFolder}
        viewMode={modelViewMode}
        fileDragBehavior={settings.fileDragBehavior}
        canNavigateBack={folderHistory.back.length > 0}
        canNavigateForward={folderHistory.forward.length > 0}
        responsivePanel={responsivePanel}
        scrollRestoreRequest={gridScrollRestoreRequest}
        modelRevealRequest={modelRevealRequest}
        onScrollTopChange={(top) => { gridScrollTopRef.current = top; }}
        onSearchChange={setSearchQuery}
        onVisibleExtensionsChange={updateVisibleExtensions}
        onRemoveFolderExclusion={removeFolderExclusion}
        onClearFolderExclusions={clearFolderExclusions}
        onSortModeChange={setSortMode}
        onOnlySelectedChange={setOnlySelected}
        onOnlyFavoritesChange={setOnlyFavorites}
        onOnlyDuplicatesChange={setOnlyDuplicates}
        onUsageFilterChange={setUsageFilter}
        onNotesFilterChange={setNotesFilter}
        onTagMatchModeChange={setTagMatchMode}
        onToggleTagFilter={toggleTagFilter}
        onViewModeChange={setModelViewMode}
        onFileDragBehaviorChange={updateFileDragBehavior}
        onNavigateBack={goBackFolder}
        onNavigateForward={goForwardFolder}
        onCopyCurrentFolderPath={copyCurrentFolderPath}
        onOpenFolder={selectFolder}
        onOpenFolderContextMenu={openFolderContextMenu}
        onMoveModelsToFolder={moveDraggedModels}
        onOpenModel={openModel}
        onOpenDefaultFile={openFileByDefault}
        onOpenModelContextMenu={openModelContextMenu}
        onToggleModelSelection={toggleModelSelection}
        onDragStartModel={startDraggingModel}
        onDragEndModel={clearDraggedModels}
        onRefresh={() => scanCurrentLibrary()}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleFolders={() =>
          setResponsivePanel((current) => toggleResponsivePanel(current, "folders"))
        }
        onToggleDetails={() =>
          setResponsivePanel((current) => toggleResponsivePanel(current, "details"))
        }
      />
      <DetailsPanel
        model={selectedModel}
        previewRequest={modelPreviewRequest}
        settings={settings}
        modelMetadata={
          selectedModel ? libraryMetadata.models[selectedModel.absolutePath] ?? null : null
        }
        availableTags={availableTags}
        launchMessage={launchMessage}
        metadataStatus={metadataStatus}
        metadataWritable={metadataStatus.writable}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLaunchSlicer={launchSlicer}
        onRenameModelFile={renameSelectedModel}
        onShowModelInFolder={(modelPath) => window.modelLibrary.showModelInFolder(modelPath)}
        onOpenLibraryFile={openLibraryImageFile}
        onToggleFavorite={toggleFavorite}
        onSetModelTags={setModelTags}
        onSetModelNotes={setModelNotes}
        onRetryMetadata={retryLibraryMetadata}
        onExtractArchive={extractArchiveFile}
        onConvertThreeMfToStl={convertSelectedThreeMfToStl}
        onArchiveFailure={(model, error) =>
          librarySessionIssueRegistry.record("archive", model.absolutePath, error)}
        onArchiveSuccess={(model) =>
          librarySessionIssueRegistry.resolve("archive", model.absolutePath)}
      />
      {responsivePanel ? (
        <button
          className="responsive-panel-scrim"
          type="button"
          onClick={() => setResponsivePanel(null)}
          aria-label={t("app.closePanel")}
        />
      ) : null}
      {isSettingsOpen ? (
        <SettingsDialog
          settings={settings}
          tagCatalog={libraryMetadata.tagCatalog}
          metadataWritable={metadataStatus.writable}
          metadataMessage={metadataStatus.message
            ? readLocalizedErrorMessage(new Error(metadataStatus.message))
            : null}
          thumbnailDiagnostics={thumbnailDiagnostics}
          onClose={() => setIsSettingsOpen(false)}
          onSaveSettings={saveSettings}
          onChooseLibraryFolder={chooseFolder}
          onChooseArchiveExtractor={chooseArchiveExtractor}
          onChooseSlicerExecutable={chooseSlicerExecutable}
          detectingSlicers={isDetectingSlicers}
          unavailableSlicerIds={unavailableSlicerIds}
          onDetectSlicers={detectInstalledSlicers}
          onAddSlicer={addSlicerProgram}
          onRenameSlicer={renameSlicerProgram}
          onRemoveSlicer={removeSlicerProgram}
          onAddCatalogTag={addCatalogTag}
          onRemoveCatalogTag={removeCatalogTag}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
        />
      ) : null}
      {undoToast ? (
        <div className="undo-toast" role="status">
          <div>
            <strong>{undoToast.label}</strong>
            <span>{undoToast.detail}</span>
          </div>
          {undoToast.undoable && !undoToast.undone ? (
            <button type="button" onClick={undoLastAction}>
              {t("common.undo")}
            </button>
          ) : null}
        </div>
      ) : null}
      {textInputDialog ? (
        <TextInputDialog
          {...textInputDialog}
          onCancel={() => closeTextInputDialog(null)}
          onConfirm={(value) => closeTextInputDialog(value)}
        />
      ) : null}
      {confirmationDialog ? (
        <ConfirmDialog
          {...confirmationDialog}
          onCancel={() => closeConfirmationDialog(false)}
          onConfirm={() => closeConfirmationDialog(true)}
        />
      ) : null}
      {tagPickerDialog ? (
        <DialogShell
          className="tag-picker-dialog"
          title={t("dialog.modelTags")}
          onCancel={() => setTagPickerDialog(null)}
        >
          <DialogHeader
            eyebrow={t("tags.label")}
            title={tagPickerDialog.model.name}
            onClose={() => setTagPickerDialog(null)}
          />
          <TagSelector
            selectedTags={libraryMetadata.models[tagPickerDialog.model.absolutePath]?.tags ?? []}
            availableTags={availableTags}
            onChange={(tags) => setModelTags(tagPickerDialog.model.absolutePath, tags)}
            disabled={!metadataStatus.writable}
            disabledReason={metadataStatus.message
              ? readLocalizedErrorMessage(new Error(metadataStatus.message))
              : undefined}
          />
        </DialogShell>
      ) : null}
      {folderContextMenu ? (
        <div
          className="context-menu"
          style={getContextMenuStyle(folderContextMenu, "folder")}
          role="menu"
          onMouseLeave={() => setFolderContextMenu(null)}
        >
          <div className="context-menu-section-title">{t("context.folder")}</div>
          <button type="button" role="menuitem" onClick={() => selectFolder(folderContextMenu.folderId)}>
            {t("context.openFolder")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void showFolderInExplorer(folderContextMenu.folderId)}
          >
            {t("details.showExplorer")}
          </button>
          <button type="button" role="menuitem" onClick={() => createFolder(folderContextMenu.folderId)}>
            {t("context.newFolderHere")}
          </button>
          {folderContextMenu.folderId !== ALL_FOLDERS_ID ? (
            <>
              <button type="button" role="menuitem" onClick={() => renameFolder(folderContextMenu.folderId)}>
                {t("common.rename")}
              </button>
              <button type="button" role="menuitem" onClick={() => moveFolder(folderContextMenu.folderId)}>
                {t("context.moveFolder")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => excludeFolder(folderContextMenu.folderId)}
              >
                {t("context.hideResults")}
              </button>
              <button
                className="danger-menu-item"
                type="button"
                role="menuitem"
                onClick={() => trashFolder(folderContextMenu.folderId)}
              >
                {t("context.trashFolder")}
              </button>
            </>
          ) : null}
          {selectedModelIds.size > 0 ? (
            <>
              <div className="context-menu-separator" />
              <div className="context-menu-section-title">{t("context.organize")}</div>
              <button
                type="button"
                role="menuitem"
                onClick={() => moveSelectedModelsToFolder(folderContextMenu.folderId)}
              >
                {t("context.moveSelectedHere")}
              </button>
              <button className="danger-menu-item" type="button" role="menuitem" onClick={trashSelectedModels}>
                {t("context.trashSelected")}
              </button>
            </>
          ) : null}
          {actionLogEntries.some((entry) => entry.undoable && !entry.undone) ? (
            <>
              <div className="context-menu-separator" />
              <div className="context-menu-section-title">{t("context.history")}</div>
              <button type="button" role="menuitem" onClick={undoLastAction}>
                {t("context.undoLast")}
              </button>
            </>
          ) : null}
          <div className="context-menu-separator" />
          <div className="context-menu-section-title">{t("context.library")}</div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setFolderContextMenu(null);
              void scanCurrentLibrary();
            }}
          >
            {t("common.refresh")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setFolderContextMenu(null);
              setIsSettingsOpen(true);
            }}
          >
            {t("common.settings")}
          </button>
        </div>
      ) : null}
      {modelContextMenu ? (
        <div
          className="context-menu"
          style={getContextMenuStyle(modelContextMenu, "model")}
          role="menu"
          onMouseLeave={() => setModelContextMenu(null)}
        >
          <div className="context-menu-section-title">{t("context.open")}</div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const model = modelContextMenu.model;
              setModelContextMenu(null);
              if (isDirectImage(model.extension)) {
                void openFileByDefault(model);
              } else {
                loadModelPreviewInPanel(model);
              }
            }}
          >
            {isDirectImage(modelContextMenu.model.extension)
              ? t("context.openWindows")
              : getDefaultFileOpenAction(modelContextMenu.model.extension) === "inspect-archive"
                ? t("context.inspectArchive")
                : t("context.loadPanel")}
          </button>
          {canShowThumbnail(modelContextMenu.model.extension) ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => retryModelThumbnail(modelContextMenu.model)}
            >
              {t("context.retryThumbnail")}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={!metadataStatus.writable}
            title={!metadataStatus.writable && metadataStatus.message
              ? readLocalizedErrorMessage(new Error(metadataStatus.message))
              : undefined}
            onClick={() => {
              const model = modelContextMenu.model;
              setModelContextMenu(null);
              void toggleFavorite(model.absolutePath);
            }}
          >
            {libraryMetadata.models[modelContextMenu.model.absolutePath]?.favorite
              ? t("details.removeFavorite")
              : t("details.addFavorite")}
          </button>
          <div className="context-menu-separator" />
          <div className="context-menu-section-title">{t("tags.label")}</div>
          <button
            type="button"
            role="menuitem"
            disabled={!metadataStatus.writable}
            title={!metadataStatus.writable && metadataStatus.message
              ? readLocalizedErrorMessage(new Error(metadataStatus.message))
              : undefined}
            onClick={() => {
              const model = modelContextMenu.model;
              setModelContextMenu(null);
              setTagPickerDialog({ model });
            }}
          >
            {t("context.tags")}
          </button>
          {enabledSlicers.length > 0 && canLaunchContextModelInSlicer ? (
            <>
              <div className="context-menu-separator" />
              <div className="context-menu-section-title">{t("context.slicer")}</div>
              {enabledSlicers.map((slicer) => {
                const launchCount = getSlicerLaunchModelCount(modelContextMenu.model);

                return (
                  <button
                    type="button"
                    role="menuitem"
                    key={slicer.id}
                    onClick={() =>
                      void launchSelectedModelsInSlicer(slicer.id, modelContextMenu.model)
                    }
                  >
                    {launchCount > 1
                      ? t("context.openSelectedIn", { name: slicer.name })
                      : t("details.openIn", { name: slicer.name })}
                  </button>
                );
              })}
            </>
          ) : null}
          {isArchive(modelContextMenu.model.extension) ? (
            <>
              <div className="context-menu-separator" />
              <div className="context-menu-section-title">{t("context.extract")}</div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const model = modelContextMenu.model;
                  setModelContextMenu(null);
                  void extractArchiveFile(model.absolutePath, "here");
                }}
              >
                {t("details.extractHere")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const model = modelContextMenu.model;
                  setModelContextMenu(null);
                  void extractArchiveFile(model.absolutePath, "named-folder");
                }}
              >
                {t("details.extractTo", { name: getArchiveBaseName(modelContextMenu.model.name) })}
              </button>
            </>
          ) : null}
          <div className="context-menu-separator" />
          <div className="context-menu-section-title">{t("context.file")}</div>
          {canConvertToStl(modelContextMenu.model.extension) ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => void convertContextModelToStl(modelContextMenu.model)}
            >
              {t("details.convertToStl")}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => viewModelFolderInLibrary(modelContextMenu.model)}
          >
            {t("context.viewFolder")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const model = modelContextMenu.model;
              setModelContextMenu(null);
              void window.modelLibrary.showModelInFolder(model.absolutePath);
            }}
          >
            {t("details.showExplorer")}
          </button>
          <button type="button" role="menuitem" onClick={renameSelectedModel}>
            {t("details.renameFile")}
          </button>
          <button className="danger-menu-item" type="button" role="menuitem" onClick={trashSelectedModels}>
            {t("context.trashSelected")}
          </button>
        </div>
      ) : null}
    </main>
    </I18nProvider>
  );
}

function joinFolder(parentFolder: string, folderName: string): string {
  const trimmedName = folderName.trim();

  if (!parentFolder) {
    return trimmedName;
  }

  return `${parentFolder}/${trimmedName}`;
}

function getArchiveBaseName(fileName: string): string {
  return fileName.replace(/\.(zip|rar|7z)$/i, "");
}

function normalizeFolderInput(folderPath: string): string {
  const trimmedPath = folderPath.trim();

  if (!trimmedPath || trimmedPath.toLowerCase() === "raiz") {
    return "";
  }

  return trimmedPath
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function buildMovedModelPath(libraryPath: string, destinationFolder: string, modelName: string): string {
  const normalizedRoot = libraryPath.replace(/[\\/]+$/g, "");
  const normalizedFolder = destinationFolder.replaceAll("/", "\\").replace(/^[\\/]+|[\\/]+$/g, "");

  return normalizedFolder
    ? `${normalizedRoot}\\${normalizedFolder}\\${modelName}`
    : `${normalizedRoot}\\${modelName}`;
}

function buildFolderPath(libraryPath: string, folderId: string): string {
  const normalizedRoot = libraryPath.replace(/[\\/]+$/g, "");
  const normalizedFolder = folderId.replaceAll("/", "\\").replace(/^[\\/]+|[\\/]+$/g, "");

  return normalizedFolder ? `${normalizedRoot}\\${normalizedFolder}` : normalizedRoot;
}

function getContextMenuStyle(
  menu: { x: number; y: number },
  type: "folder" | "model"
): CSSProperties {
  const position = getContextMenuPosition({
    x: menu.x,
    y: menu.y,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    menuWidth: CONTEXT_MENU_WIDTH,
    menuHeight: type === "model" ? MODEL_CONTEXT_MENU_HEIGHT : FOLDER_CONTEXT_MENU_HEIGHT
  });

  return {
    left: position.left,
    top: position.top
  };
}

function createActionLogEntry(
  label: string,
  detail: string,
  restorePairs?: FileRestorePair[]
): LocalActionLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label,
    detail,
    createdAt: new Date().toISOString(),
    undoable: Boolean(restorePairs?.length),
    undone: false,
    restorePairs
  };
}

function createFileDragSessionId(): string {
  return typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `file-drag-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createRenameRestorePairs(nextPath: string, previousPath: string): FileRestorePair[] {
  return samePath(nextPath, previousPath)
    ? []
    : [{ sourcePath: nextPath, destinationPath: previousPath }];
}

function samePath(left: string, right: string): boolean {
  return left.replaceAll("\\", "/").toLowerCase() === right.replaceAll("\\", "/").toLowerCase();
}

function readErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lastError = message.split("Error: ").pop();
  return lastError || message;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getAncestorFolderIds(folderId: string): string[] {
  const parts = folderId.split("/").filter(Boolean);
  const ancestors: string[] = [];

  for (let index = 1; index < parts.length; index += 1) {
    ancestors.push(parts.slice(0, index).join("/"));
  }

  return ancestors;
}

function getAllFolderIds(folders: FolderNode[]): string[] {
  const folderIds: string[] = [];

  for (const folder of folders) {
    folderIds.push(folder.id, ...getAllFolderIds(folder.children));
  }

  return folderIds;
}

function readExpandedFolders(): Set<string> {
  try {
    const rawValue = window.localStorage.getItem(EXPANDED_FOLDERS_STORAGE_KEY);

    if (!rawValue) {
      return new Set();
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue)
      ? new Set(parsedValue.filter((value): value is string => typeof value === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function getAvailableTags(models: ModelFile[], libraryMetadata: LibraryMetadata): string[] {
  const modelPaths = new Set(models.map((model) => model.absolutePath));
  const tags = new Set<string>(libraryMetadata.tagCatalog);

  for (const [modelPath, metadata] of Object.entries(libraryMetadata.models)) {
    if (!modelPaths.has(modelPath)) {
      continue;
    }

    for (const tag of metadata.tags) {
      tags.add(tag);
    }
  }

  return [...tags].sort((left, right) => left.localeCompare(right));
}

function getHashCandidateModels(models: ModelFile[]) {
  const modelsBySize = new Map<number, ModelFile[]>();

  for (const model of models) {
    modelsBySize.set(model.sizeBytes, [...(modelsBySize.get(model.sizeBytes) ?? []), model]);
  }

  return [...modelsBySize.values()]
    .filter((modelsWithSameSize) => modelsWithSameSize.length > 1)
    .flat()
    .map(({ absolutePath, sizeBytes, modifiedAt }) => ({ absolutePath, sizeBytes, modifiedAt }));
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export default App;
