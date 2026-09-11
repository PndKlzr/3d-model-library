import type { CSSProperties } from "react";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ConfirmDialog, type ConfirmDialogOptions } from "./components/ConfirmDialog";
import { DetailsPanel } from "./components/DetailsPanel";
import { DialogShell } from "./components/DialogShell";
import { FirstRun } from "./components/FirstRun";
import { FolderTree } from "./components/FolderTree";
import { ModelGrid } from "./components/ModelGrid";
import { SettingsDialog } from "./components/SettingsDialog";
import { TagSelector } from "./components/TagSelector";
import { TextInputDialog, type TextInputDialogOptions } from "./components/TextInputDialog";
import { appendActionLogEntry, markActionUndone } from "./lib/actionLog";
import { getContextMenuPosition } from "./lib/contextMenuPosition";
import { buildFolderTree, type FolderNode } from "./lib/folderTree";
import {
  ALL_FOLDERS_ID,
  filterModels,
  type ModelSortMode,
  type ModelTypeFilter,
  type NotesFilter,
  type TagMatchMode,
  type UsageFilter
} from "./lib/folderFilters";
import {
  createFolderNavigationHistory,
  goBackInFolderHistory,
  goForwardInFolderHistory,
  pushFolderHistory
} from "./lib/folderNavigationHistory";
import { getDragModelIds, getDragOutFilePaths } from "./lib/dragFiles";
import { getDuplicateModelIds } from "./lib/duplicateModels";
import { getGridFolderCards } from "./lib/gridFolders";
import { updateSelectionForGesture } from "./lib/modelSelection";
import { modelThumbnailService } from "./lib/modelThumbnailService";
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
import { convertThreeMfToStlInWorker } from "./lib/threeMfToStlWorker";
import {
  parseModelViewMode,
  parseThemeMode,
  type ModelViewMode,
  type ThemeMode
} from "./lib/viewPreferences";
import type {
  AppSettings,
  FileDragBehavior,
  FileRestorePair,
  LibraryActionLogEntry,
  LibraryMetadata,
  LibraryMetadataStatus,
  LibraryScanResult,
  ModelHashResult,
  ModelFile
} from "./shared/types";

const EXPANDED_FOLDERS_STORAGE_KEY = "model-library-expanded-folders";
const MODEL_VIEW_MODE_STORAGE_KEY = "model-library-view-mode";
const THEME_MODE_STORAGE_KEY = "model-library-theme-mode";
const OPERATION_MESSAGE_TIMEOUT_MS = 6000;
const UNDO_TOAST_TIMEOUT_MS = 8000;
const CONTEXT_MENU_WIDTH = 320;
const FOLDER_CONTEXT_MENU_HEIGHT = 430;
const MODEL_CONTEXT_MENU_HEIGHT = 420;

type LocalActionLogEntry = LibraryActionLogEntry & {
  restorePairs?: FileRestorePair[];
};

type BenchmarkConfiguration = {
  scenario: ThumbnailBenchmarkScenario;
  models: ModelFile[];
  cachedIndexReadyMs: number;
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
  const [scanResult, setScanResult] = useState<LibraryScanResult | null>(null);
  const [selectedFolder, setSelectedFolder] = useState(ALL_FOLDERS_ID);
  const [folderHistory, setFolderHistory] = useState(createFolderNavigationHistory);
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(() => new Set());
  const [lastSelectedModelId, setLastSelectedModelId] = useState<string | null>(null);
  const [lastFocusedItem, setLastFocusedItem] = useState<FocusedLibraryItem>("folder");
  const [draggedModelIds, setDraggedModelIds] = useState<string[]>([]);
  const draggedModelIdsRef = useRef<string[]>([]);
  const activeFileDragSessionRef = useRef<string | null>(null);
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
  const [typeFilter, setTypeFilter] = useState<ModelTypeFilter>("all");
  const [sortMode, setSortMode] = useState<ModelSortMode>("name");
  const [onlySelected, setOnlySelected] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [notesFilter, setNotesFilter] = useState<NotesFilter>("all");
  const [tagMatchMode, setTagMatchMode] = useState<TagMatchMode>("all");
  const [selectedTagFilters, setSelectedTagFilters] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [libraryMetadata, setLibraryMetadata] = useState<LibraryMetadata>({
    models: {},
    tagCatalog: [],
    slicerHistory: []
  });
  const [metadataStatus, setMetadataStatus] = useState<LibraryMetadataStatus>({
    availability: "unavailable",
    writable: false,
    source: "empty",
    message: "Biblioteca ainda não conectada."
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [monitorStatus, setMonitorStatus] = useState<"active" | "disabled" | "error">("disabled");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [actionLogEntries, setActionLogEntries] = useState<LocalActionLogEntry[]>([]);
  const [undoToast, setUndoToast] = useState<LocalActionLogEntry | null>(null);
  const [modelHashes, setModelHashes] = useState<ModelHashResult>({});
  const [textInputDialog, setTextInputDialog] = useState<TextInputDialogOptions | null>(null);
  const textInputResolver = useRef<((value: string | null) => void) | null>(null);
  const [confirmationDialog, setConfirmationDialog] = useState<ConfirmDialogOptions | null>(null);
  const confirmationResolver = useRef<((value: boolean) => void) | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isFilteringStale = deferredSearchQuery !== searchQuery;

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      window.modelLibrary.getSettings(),
      window.modelLibrary.getLibraryMetadata(),
      window.modelLibrary.getLibraryMetadataStatus()
    ])
      .then(([loadedSettings, loadedMetadata, loadedMetadataStatus]) => {
        if (isMounted) {
          setSettings(loadedSettings);
          setLibraryMetadata(loadedMetadata);
          setMetadataStatus(loadedMetadataStatus);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => modelThumbnailService.subscribe(setThumbnailDiagnostics), []);

  useEffect(() => {
    const longTaskObserver = observeThumbnailLongTasks(modelThumbnailService);
    longTaskObserver.start();
    return () => longTaskObserver.stop();
  }, []);

  useEffect(() => {
    if (settings?.libraryPath) {
      void restoreAndScanLibrary(settings.libraryPath);
    }
  }, [settings?.libraryPath]);

  useEffect(() => {
    if (!settings?.libraryPath) {
      return;
    }

    const rootPath = settings.libraryPath;
    let isCurrent = true;
    setMonitorStatus("disabled");
    const unsubscribeChanged = window.modelLibrary.onLibraryChanged(async () => {
      const cachedResult = await window.modelLibrary.getCachedLibrary(rootPath);

      if (isCurrent && cachedResult) {
        setScanResult(cachedResult);
      }
    });
    const unsubscribeError = window.modelLibrary.onLibraryMonitoringError((message) => {
      if (isCurrent) {
        setMonitorStatus("error");
        setOperationMessage(`Monitoramento pausado: ${message}. Use o botão Atualizar.`);
      }
    });

    void window.modelLibrary.setLibraryMonitoring(settings.monitorLibrary)
      .then(() => {
        if (isCurrent) setMonitorStatus(settings.monitorLibrary ? "active" : "disabled");
      })
      .catch((error) => {
        if (isCurrent) {
          setMonitorStatus("error");
          setOperationMessage(`Monitoramento pausado: ${readErrorMessage(error)}. Use o botão Atualizar.`);
        }
      });

    return () => {
      isCurrent = false;
      unsubscribeChanged();
      unsubscribeError();
    };
  }, [settings?.libraryPath, settings?.monitorLibrary]);

  useEffect(() => {
    const unsubscribe = window.modelLibrary.onFileDragStatus?.((status) => {
      setOperationMessage(status.message);

      if (
        status.state !== "started" &&
        status.sessionId === activeFileDragSessionRef.current
      ) {
        clearDraggedModels();
      }
    });

    return () => unsubscribe?.();
  }, []);

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
        if (!isStale) {
          setModelHashes(hashes);
        }
      })
      .catch((error) => {
        if (!isStale) {
          setOperationMessage(readErrorMessage(error));
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
    textInputDialog
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
    selectedFolder,
    tagPickerDialog,
    textInputDialog
  ]);

  async function refreshMetadataState() {
    const [nextMetadata, nextStatus] = await Promise.all([
      window.modelLibrary.getLibraryMetadata(),
      window.modelLibrary.getLibraryMetadataStatus()
    ]);
    setLibraryMetadata(nextMetadata);
    setMetadataStatus(nextStatus);
  }

  async function retryLibraryMetadata() {
    try {
      const nextStatus = await window.modelLibrary.retryLibraryMetadata();
      setMetadataStatus(nextStatus);
      setLibraryMetadata(await window.modelLibrary.getLibraryMetadata());
      setOperationMessage(nextStatus.message ?? "Dados da biblioteca reconectados.");
    } catch (error) {
      setOperationMessage(
        `Não foi possível reconectar os dados da biblioteca: ${readErrorMessage(error)}`
      );
    }
  }

  async function chooseFolder() {
    const libraryPath = await window.modelLibrary.chooseLibraryFolder();

    if (!libraryPath || !settings) {
      return;
    }

    const savedSettings = await window.modelLibrary.saveSettings({
      ...settings,
      libraryPath
    });

    setSettings(savedSettings);
    await refreshMetadataState();
    setSelectedFolder(ALL_FOLDERS_ID);
    setFolderHistory(createFolderNavigationHistory());
    setSelectedModel(null);
    setSelectedModelIds(new Set());
    setLastSelectedModelId(null);
  }

  async function saveSettings(nextSettings: AppSettings) {
    const libraryChanged = settings?.libraryPath !== nextSettings.libraryPath;
    const savedSettings = await window.modelLibrary.saveSettings(nextSettings);
    setSettings(savedSettings);
    if (libraryChanged) {
      await refreshMetadataState();
    }
  }

  function updateFileDragBehavior(fileDragBehavior: FileDragBehavior) {
    if (!settings || settings.fileDragBehavior === fileDragBehavior) {
      return;
    }

    void saveSettings({ ...settings, fileDragBehavior });
  }

  async function chooseSlicerExecutable(slicer: AppSettings["slicers"][number]) {
    if (!settings) {
      return;
    }

    const executablePath = await window.modelLibrary.chooseSlicerExecutable();

    if (!executablePath) {
      return;
    }

    await saveSettings({
      ...settings,
      defaultSlicerId: settings.defaultSlicerId ?? slicer.id,
      slicers: settings.slicers.map((item) =>
        item.id === slicer.id ? { ...item, executablePath, enabled: true } : item
      )
    });
  }

  async function chooseArchiveExtractor() {
    if (!settings) {
      return;
    }

    const archiveExtractorPath = await window.modelLibrary.chooseArchiveExtractor();

    if (!archiveExtractorPath) {
      return;
    }

    await saveSettings({
      ...settings,
      archiveExtractorPath
    });
  }

  async function launchSlicer(slicerId: string, modelPaths: string | string[]) {
    const result = await window.modelLibrary.launchSlicer(slicerId, modelPaths);
    setLaunchMessage(result.message);

    if (result.ok) {
      await refreshMetadataState();
    }
  }

  function getSlicerLaunchModelPaths(contextModel: ModelFile): string[] {
    const selectedPrintableModels = (scanResult?.models ?? []).filter(
      (model) => selectedModelIds.has(model.id) && isPrintableModel(model)
    );

    if (selectedModelIds.has(contextModel.id) && selectedPrintableModels.length > 0) {
      return selectedPrintableModels.map((model) => model.absolutePath);
    }

    return isPrintableModel(contextModel) ? [contextModel.absolutePath] : [];
  }

  function getSlicerLaunchModelCount(contextModel: ModelFile): number {
    return getSlicerLaunchModelPaths(contextModel).length;
  }

  async function launchSelectedModelsInSlicer(slicerId: string, contextModel: ModelFile) {
    const modelPaths = getSlicerLaunchModelPaths(contextModel);
    setModelContextMenu(null);

    if (modelPaths.length === 0) {
      setLaunchMessage("Selecione pelo menos um STL ou 3MF para abrir no slicer.");
      return;
    }

    await launchSlicer(slicerId, modelPaths);
  }

  async function openModelInDefaultSlicer(model: ModelFile) {
    if (!isPrintableModel(model)) {
      setLaunchMessage("Extraia um STL ou 3MF antes de abrir no slicer.");
      return;
    }

    if (!settings?.defaultSlicerId) {
      setLaunchMessage("Escolha um slicer padrão nas configurações para abrir com duplo clique.");
      return;
    }

    const defaultSlicer = settings.slicers.find((slicer) => slicer.id === settings.defaultSlicerId);

    if (!defaultSlicer?.enabled || !defaultSlicer.executablePath) {
      setLaunchMessage("Configure e ative o slicer padrão antes de usar o duplo clique.");
      return;
    }

    await launchSlicer(settings.defaultSlicerId, model.absolutePath);
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
    try {
      setLibraryMetadata(await operation());
      setMetadataStatus(await window.modelLibrary.getLibraryMetadataStatus());
    } catch (error) {
      setMetadataStatus(await window.modelLibrary.getLibraryMetadataStatus());
      setOperationMessage(
        `Não foi possível salvar os dados da biblioteca: ${readErrorMessage(error)}`
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

    return false;
  }

  async function addCatalogTag() {
    const tag = await requestTextInput({
      title: "Nova tag",
      label: "Nome da tag",
      placeholder: "ex: cosplay",
      confirmLabel: "Criar tag"
    });

    if (!tag?.trim()) {
      return;
    }

    await persistMetadataMutation(() => window.modelLibrary.addCatalogTag(tag));
  }

  async function removeCatalogTag(tag: string) {
    const confirmed = await requestConfirmation({
      title: "Excluir tag",
      message: `Remover a tag "${tag}" da lista e de todos os modelos?`,
      confirmLabel: "Excluir tag",
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

  async function scanLibrary(rootPath: string, preferredSelectedPaths: string[] = []) {
    setIsScanning(true);

    try {
      const nextScanResult = await window.modelLibrary.scanLibrary(rootPath);
      setScanResult(nextScanResult);
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
    } finally {
      setIsScanning(false);
    }
  }

  async function restoreAndScanLibrary(rootPath: string) {
    try {
      const cachedResult = await window.modelLibrary.getCachedLibrary(rootPath);

      if (cachedResult) {
        setScanResult(cachedResult);
      }
    } catch (error) {
      setOperationMessage(readErrorMessage(error));
    }

    return scanLibrary(rootPath);
  }

  function selectFolder(folderId: string) {
    setFolderHistory((currentHistory) =>
      pushFolderHistory(currentHistory, selectedFolder, folderId)
    );
    navigateToFolder(folderId);
  }

  function navigateToFolder(folderId: string) {
    setLastFocusedItem("folder");
    setFolderContextMenu(null);
    setModelContextMenu(null);
    setSelectedFolder(folderId);
    expandFolderAncestors(folderId);
  }

  function goBackFolder() {
    const result = goBackInFolderHistory(folderHistory, selectedFolder);

    if (!result) {
      return;
    }

    setFolderHistory(result.history);
    navigateToFolder(result.folderId);
  }

  function goForwardFolder() {
    const result = goForwardInFolderHistory(folderHistory, selectedFolder);

    if (!result) {
      return;
    }

    setFolderHistory(result.history);
    navigateToFolder(result.folderId);
  }

  function openFolderContextMenu(folderId: string, x: number, y: number) {
    setLastFocusedItem("folder");
    setModelContextMenu(null);
    expandFolderAncestors(folderId);
    setFolderContextMenu({ folderId, x, y });
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

  function retryModelThumbnail(model: ModelFile) {
    modelThumbnailService.retry(model);
    setThumbnailRetryGenerations((current) => ({
      ...current,
      [model.absolutePath]: (current[model.absolutePath] ?? 0) + 1
    }));
    setModelContextMenu(null);
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
        ? `Organizando ${filePaths.length} arquivo(s).`
        : `Arrastando ${filePaths.length} arquivo(s).`
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
      title: parentFolder ? `Nova pasta em ${parentFolder}` : "Nova pasta na raiz",
      label: "Nome da pasta",
      confirmLabel: "Criar pasta"
    });

    if (!folderName?.trim()) {
      return;
    }

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.createFolder(parentFolder, folderName);
      selectFolder(joinFolder(parentFolder, folderName.trim()));
      return {
        message: result.message,
        selectedPaths: [],
        action: createActionLogEntry("Pasta criada", joinFolder(parentFolder, folderName.trim()))
      };
    });
  }

  async function renameFolder(folderId = selectedFolder) {
    setFolderContextMenu(null);
    setModelContextMenu(null);

    if (!settings?.libraryPath || folderId === ALL_FOLDERS_ID) {
      setOperationMessage("Selecione uma pasta para renomear.");
      return;
    }

    const currentName = folderId.split("/").pop() ?? folderId;
    const nextName = await requestTextInput({
      title: "Renomear pasta",
      label: "Novo nome da pasta",
      initialValue: currentName,
      confirmLabel: "Renomear"
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
        message: result.message,
        selectedPaths: [],
        action:
          restorePairs.length > 0
            ? createActionLogEntry("Pasta renomeada", `${folderId} -> ${destinationLabel}`, restorePairs)
            : undefined
      };
    });
  }

  async function moveFolder(folderId = selectedFolder) {
    setFolderContextMenu(null);
    setModelContextMenu(null);

    if (!settings?.libraryPath || folderId === ALL_FOLDERS_ID) {
      setOperationMessage("Selecione uma pasta para mover.");
      return;
    }

    const folderName = folderId.split("/").pop() ?? folderId;
    const destinationFolder = await requestTextInput({
      title: `Mover ${folderName}`,
      label: "Pasta destino",
      placeholder: "Vazio = Raiz; ex: Decoracao/Suportes",
      confirmLabel: "Mover"
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
        message: result.message,
        selectedPaths: [],
        action:
          restorePairs.length > 0
            ? createActionLogEntry("Pasta movida", `${folderId} -> ${destinationLabel}`, restorePairs)
            : undefined
      };
    });
  }

  async function trashFolder(folderId = selectedFolder) {
    setFolderContextMenu(null);
    setModelContextMenu(null);

    if (!settings?.libraryPath || folderId === ALL_FOLDERS_ID) {
      setOperationMessage("Selecione uma pasta para enviar para a Lixeira.");
      return;
    }

    const folderName = folderId.split("/").pop() ?? folderId;
    const confirmed = await requestConfirmation({
      title: "Mover pasta para a Lixeira",
      message: `Mover a pasta "${folderName}" para a Lixeira?`,
      confirmLabel: "Mover para Lixeira",
      tone: "danger"
    });

    if (!confirmed) {
      return;
    }

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.trashFolder(folderId);
      selectFolder(ALL_FOLDERS_ID);

      return {
        message: result.message,
        selectedPaths: [],
        action: createActionLogEntry("Pasta na Lixeira", folderId)
      };
    });
  }

  async function renameSelectedModel() {
    setModelContextMenu(null);

    if (!selectedModel || !settings?.libraryPath) {
      return;
    }

    const nextName = await requestTextInput({
      title: "Renomear arquivo",
      label: "Novo nome do arquivo",
      initialValue: selectedModel.name,
      confirmLabel: "Renomear"
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
        message: result.message,
        selectedPaths: result.path ? [result.path] : [],
        action:
          restorePairs.length > 0
            ? createActionLogEntry("Arquivo renomeado", `${selectedModel.name} -> ${nextName}`, restorePairs)
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
        message: result.message,
        selectedPaths: restorePairs.map((pair) => pair.sourcePath),
        action:
          restorePairs.length > 0
            ? createActionLogEntry(
                "Modelos movidos",
                `${restorePairs.length} para ${targetFolder || "Raiz"}`,
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
      title: "Mover arquivos para a Lixeira",
      message: `Mover ${modelsToTrash.length} arquivo${modelsToTrash.length === 1 ? "" : "s"} para a Lixeira?`,
      confirmLabel: "Mover para Lixeira",
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
        message: result.message,
        selectedPaths: [],
        action: createActionLogEntry(
          "Arquivos na Lixeira",
          `${modelsToTrash.length} arquivo${modelsToTrash.length === 1 ? "" : "s"}`
        )
      };
    });
  }

  async function extractArchiveEntries(archivePath: string, entryPaths: string[]) {
    if (!settings?.libraryPath || entryPaths.length === 0) {
      return;
    }

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.extractArchiveEntries(archivePath, entryPaths);

      return {
        message: result.message,
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
        message: result.message,
        selectedPaths: result.paths ?? []
      };
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

    try {
      const result = await window.modelLibrary.restoreLibraryPaths(undoableAction.restorePairs);
      setActionLogEntries((entries) => markActionUndone(entries, undoableAction.id));
      setUndoToast(null);
      setOperationMessage(result.message);
      setLibraryMetadata(await window.modelLibrary.getLibraryMetadata());
      await scanLibrary(settings.libraryPath, result.paths ?? []);
    } catch (error) {
      setOperationMessage(readErrorMessage(error));
    }
  }

  async function runLibraryOperation(
    operation: () => Promise<{
      message: string;
      selectedPaths: string[];
      action?: LocalActionLogEntry;
    }>
  ) {
    if (!settings?.libraryPath) {
      return;
    }

    try {
      const result = await operation();
      setOperationMessage(result.message);
      if (result.action) {
        setActionLogEntries((entries) => appendActionLogEntry(entries, result.action!));
        setUndoToast(result.action);
      }
      setLibraryMetadata(await window.modelLibrary.getLibraryMetadata());
      await scanLibrary(settings.libraryPath, result.selectedPaths);
    } catch (error) {
      setOperationMessage(readErrorMessage(error));
    } finally {
      clearDraggedModels();
    }
  }

  async function updateIncludeSubfolders(includeSubfolders: boolean) {
    if (!settings) {
      return;
    }

    const savedSettings = await window.modelLibrary.saveSettings({
      ...settings,
      includeSubfolders
    });

    setSettings(savedSettings);
  }

  const models = scanResult?.models ?? [];
  const folders = useMemo(
    () => buildFolderTree(models, scanResult?.folders ?? []),
    [models, scanResult?.folders]
  );
  const includeSubfolders = settings?.includeSubfolders ?? true;
  const folderCards = useMemo(
    () => getGridFolderCards(folders, models, selectedFolder, includeSubfolders),
    [folders, includeSubfolders, models, selectedFolder]
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
  const filteredModels = useMemo(
    () =>
      filterModels(models, selectedFolder, includeSubfolders, deferredSearchQuery, {
        type: typeFilter,
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
      typeFilter
    ]
  );

  if (isLoading) {
    return (
      <main className="first-run" data-theme={themeMode}>
        <div>
          <p className="eyebrow">Carregando</p>
          <h1>Preparando biblioteca</h1>
        </div>
      </main>
    );
  }

  if (!settings?.libraryPath) {
    return <FirstRun onChooseFolder={chooseFolder} themeMode={themeMode} />;
  }

  const canLaunchContextModelInSlicer = modelContextMenu
    ? getSlicerLaunchModelCount(modelContextMenu.model) > 0
    : false;

  return (
    <main className="app-shell" data-theme={themeMode}>
      <FolderTree
        folders={folders}
        selectedFolder={selectedFolder}
        includeSubfolders={settings.includeSubfolders}
        modelCount={models.length}
        selectedModelCount={selectedModelIds.size}
        canMoveModels={draggedModelIds.length > 0}
        pointerDragOverFolder={null}
        expandedFolderIds={expandedFolderIds}
        onSelectFolder={selectFolder}
        onToggleFolder={toggleExpandedFolder}
        onExpandAllFolders={expandAllFolders}
        onCollapseAllFolders={collapseAllFolders}
        onToggleIncludeSubfolders={updateIncludeSubfolders}
        onOpenFolderContextMenu={openFolderContextMenu}
        onMoveModelsToFolder={moveDraggedModels}
      />
      <ModelGrid
        models={filteredModels}
        folderCards={folderCards}
        scanErrors={scanResult?.errors ?? []}
        selectedModelId={selectedModel?.id ?? null}
        selectedModelIds={selectedModelIds}
        searchQuery={searchQuery}
        typeFilter={typeFilter}
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
        onSearchChange={setSearchQuery}
        onTypeFilterChange={setTypeFilter}
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
        onOpenFolder={selectFolder}
        onOpenFolderContextMenu={openFolderContextMenu}
        onMoveModelsToFolder={moveDraggedModels}
        onOpenModel={openModel}
        onOpenDefaultSlicer={openModelInDefaultSlicer}
        onOpenModelContextMenu={openModelContextMenu}
        onToggleModelSelection={toggleModelSelection}
        onDragStartModel={startDraggingModel}
        onDragEndModel={clearDraggedModels}
        onRefresh={() => scanLibrary(settings.libraryPath ?? "")}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <DetailsPanel
        model={selectedModel}
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
        onToggleFavorite={toggleFavorite}
        onSetModelTags={setModelTags}
        onSetModelNotes={setModelNotes}
        onRetryMetadata={retryLibraryMetadata}
        onExtractArchiveEntries={extractArchiveEntries}
        onConvertThreeMfToStl={convertSelectedThreeMfToStl}
      />
      {isSettingsOpen ? (
        <SettingsDialog
          settings={settings}
          tagCatalog={libraryMetadata.tagCatalog}
          metadataWritable={metadataStatus.writable}
          metadataMessage={metadataStatus.message}
          thumbnailDiagnostics={thumbnailDiagnostics}
          onClose={() => setIsSettingsOpen(false)}
          onSaveSettings={saveSettings}
          onChooseLibraryFolder={chooseFolder}
          onChooseArchiveExtractor={chooseArchiveExtractor}
          onChooseSlicerExecutable={chooseSlicerExecutable}
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
              Desfazer
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
          title="Tags do modelo"
          onCancel={() => setTagPickerDialog(null)}
        >
          <header className="dialog-header">
            <div>
              <p className="eyebrow">Tags</p>
              <h2>{tagPickerDialog.model.name}</h2>
            </div>
            <button
              className="icon-only"
              type="button"
              onClick={() => setTagPickerDialog(null)}
              aria-label="Fechar"
              title="Fechar"
            >
              Fechar
            </button>
          </header>
          <TagSelector
            selectedTags={libraryMetadata.models[tagPickerDialog.model.absolutePath]?.tags ?? []}
            availableTags={availableTags}
            onChange={(tags) => setModelTags(tagPickerDialog.model.absolutePath, tags)}
            disabled={!metadataStatus.writable}
            disabledReason={metadataStatus.message}
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
          <div className="context-menu-section-title">Pasta</div>
          <button type="button" role="menuitem" onClick={() => selectFolder(folderContextMenu.folderId)}>
            Abrir pasta
          </button>
          <button type="button" role="menuitem" onClick={() => createFolder(folderContextMenu.folderId)}>
            Nova pasta aqui
          </button>
          {folderContextMenu.folderId !== ALL_FOLDERS_ID ? (
            <>
              <button type="button" role="menuitem" onClick={() => renameFolder(folderContextMenu.folderId)}>
                Renomear
              </button>
              <button type="button" role="menuitem" onClick={() => moveFolder(folderContextMenu.folderId)}>
                Mover pasta...
              </button>
              <button
                className="danger-menu-item"
                type="button"
                role="menuitem"
                onClick={() => trashFolder(folderContextMenu.folderId)}
              >
                Mover pasta para Lixeira
              </button>
            </>
          ) : null}
          {selectedModelIds.size > 0 ? (
            <>
              <div className="context-menu-separator" />
              <div className="context-menu-section-title">Organizar</div>
              <button
                type="button"
                role="menuitem"
                onClick={() => moveSelectedModelsToFolder(folderContextMenu.folderId)}
              >
                Mover selecionados aqui
              </button>
              <button className="danger-menu-item" type="button" role="menuitem" onClick={trashSelectedModels}>
                Mover selecionados para Lixeira
              </button>
            </>
          ) : null}
          {actionLogEntries.some((entry) => entry.undoable && !entry.undone) ? (
            <>
              <div className="context-menu-separator" />
              <div className="context-menu-section-title">Histórico</div>
              <button type="button" role="menuitem" onClick={undoLastAction}>
                Desfazer última ação
              </button>
            </>
          ) : null}
          <div className="context-menu-separator" />
          <div className="context-menu-section-title">Biblioteca</div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setFolderContextMenu(null);
              void scanLibrary(settings.libraryPath ?? "");
            }}
          >
            Atualizar biblioteca
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setFolderContextMenu(null);
              setIsSettingsOpen(true);
            }}
          >
            Configurações
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
          <div className="context-menu-section-title">Modelo</div>
          <button
            type="button"
            role="menuitem"
            onClick={() => openModel(modelContextMenu.model, { ctrlKey: false, shiftKey: false })}
          >
            Carregar no painel
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => retryModelThumbnail(modelContextMenu.model)}
          >
            Tentar miniatura novamente
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!metadataStatus.writable}
            title={!metadataStatus.writable ? metadataStatus.message ?? undefined : undefined}
            onClick={() => {
              const model = modelContextMenu.model;
              setModelContextMenu(null);
              void toggleFavorite(model.absolutePath);
            }}
          >
            {libraryMetadata.models[modelContextMenu.model.absolutePath]?.favorite
              ? "Remover dos favoritos"
              : "Adicionar aos favoritos"}
          </button>
          <div className="context-menu-separator" />
          <div className="context-menu-section-title">Tags</div>
          <button
            type="button"
            role="menuitem"
            disabled={!metadataStatus.writable}
            title={!metadataStatus.writable ? metadataStatus.message ?? undefined : undefined}
            onClick={() => {
              const model = modelContextMenu.model;
              setModelContextMenu(null);
              setTagPickerDialog({ model });
            }}
          >
            Tags...
          </button>
          {enabledSlicers.length > 0 && canLaunchContextModelInSlicer ? (
            <>
              <div className="context-menu-separator" />
              <div className="context-menu-section-title">Slicer</div>
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
                      ? `Abrir selecionados no ${slicer.name}`
                      : `Abrir no ${slicer.name}`}
                  </button>
                );
              })}
            </>
          ) : null}
          <div className="context-menu-separator" />
          <div className="context-menu-section-title">Arquivo</div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const model = modelContextMenu.model;
              setModelContextMenu(null);
              void window.modelLibrary.showModelInFolder(model.absolutePath);
            }}
          >
            Mostrar no Explorer
          </button>
          <button type="button" role="menuitem" onClick={renameSelectedModel}>
            Renomear arquivo
          </button>
          <button className="danger-menu-item" type="button" role="menuitem" onClick={trashSelectedModels}>
            Mover selecionados para Lixeira
          </button>
        </div>
      ) : null}
    </main>
  );
}

function joinFolder(parentFolder: string, folderName: string): string {
  const trimmedName = folderName.trim();

  if (!parentFolder) {
    return trimmedName;
  }

  return `${parentFolder}/${trimmedName}`;
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

function isPrintableModel(model: ModelFile): boolean {
  return model.extension === ".stl" || model.extension === ".3mf";
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
