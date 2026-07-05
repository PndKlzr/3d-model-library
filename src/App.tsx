import { useEffect, useRef, useState } from "react";
import { DetailsPanel } from "./components/DetailsPanel";
import { FirstRun } from "./components/FirstRun";
import { FolderTree } from "./components/FolderTree";
import { ModelGrid } from "./components/ModelGrid";
import { SettingsDialog } from "./components/SettingsDialog";
import { TextInputDialog, type TextInputDialogOptions } from "./components/TextInputDialog";
import { appendActionLogEntry, markActionUndone } from "./lib/actionLog";
import { buildFolderTree } from "./lib/folderTree";
import { ALL_FOLDERS_ID, filterModels, type ModelSortMode, type ModelTypeFilter } from "./lib/folderFilters";
import {
  createFolderNavigationHistory,
  goBackInFolderHistory,
  goForwardInFolderHistory,
  pushFolderHistory
} from "./lib/folderNavigationHistory";
import { getDuplicateModelIds } from "./lib/duplicateModels";
import { getGridFolderCards } from "./lib/gridFolders";
import { updateSelectionForGesture } from "./lib/modelSelection";
import { getMouseNavigationIntent } from "./lib/mouseNavigation";
import { getRenameTarget, type FocusedLibraryItem } from "./lib/renameTarget";
import { parseModelViewMode, type ModelViewMode } from "./lib/viewPreferences";
import type {
  AppSettings,
  FileRestorePair,
  LibraryActionLogEntry,
  LibraryMetadata,
  LibraryScanResult,
  ModelHashResult,
  ModelFile
} from "./shared/types";

const EXPANDED_FOLDERS_STORAGE_KEY = "model-library-expanded-folders";
const MODEL_VIEW_MODE_STORAGE_KEY = "model-library-view-mode";
const OPERATION_MESSAGE_TIMEOUT_MS = 6000;
const UNDO_TOAST_TIMEOUT_MS = 8000;

type LocalActionLogEntry = LibraryActionLogEntry & {
  restorePairs?: FileRestorePair[];
};

function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [scanResult, setScanResult] = useState<LibraryScanResult | null>(null);
  const [selectedFolder, setSelectedFolder] = useState(ALL_FOLDERS_ID);
  const [folderHistory, setFolderHistory] = useState(createFolderNavigationHistory);
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(() => new Set());
  const [lastSelectedModelId, setLastSelectedModelId] = useState<string | null>(null);
  const [lastFocusedItem, setLastFocusedItem] = useState<FocusedLibraryItem>("folder");
  const [draggedModelIds, setDraggedModelIds] = useState<string[]>([]);
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
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() =>
    readExpandedFolders()
  );
  const [modelViewMode, setModelViewMode] = useState<ModelViewMode>(() =>
    parseModelViewMode(window.localStorage.getItem(MODEL_VIEW_MODE_STORAGE_KEY))
  );
  const [typeFilter, setTypeFilter] = useState<ModelTypeFilter>("all");
  const [sortMode, setSortMode] = useState<ModelSortMode>("name");
  const [onlySelected, setOnlySelected] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [selectedTagFilters, setSelectedTagFilters] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [libraryMetadata, setLibraryMetadata] = useState<LibraryMetadata>({
    models: {},
    tagCatalog: [],
    slicerHistory: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [actionLogEntries, setActionLogEntries] = useState<LocalActionLogEntry[]>([]);
  const [undoToast, setUndoToast] = useState<LocalActionLogEntry | null>(null);
  const [modelHashes, setModelHashes] = useState<ModelHashResult>({});
  const [textInputDialog, setTextInputDialog] = useState<TextInputDialogOptions | null>(null);
  const textInputResolver = useRef<((value: string | null) => void) | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([window.modelLibrary.getSettings(), window.modelLibrary.getLibraryMetadata()])
      .then(([loadedSettings, loadedMetadata]) => {
        if (isMounted) {
          setSettings(loadedSettings);
          setLibraryMetadata(loadedMetadata);
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

  useEffect(() => {
    if (settings?.libraryPath) {
      void scanLibrary(settings.libraryPath);
    }
  }, [settings?.libraryPath]);

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

    if (!settings?.libraryPath || hashCandidates.length === 0) {
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
        setFolderContextMenu(null);
        setModelContextMenu(null);
        return;
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
  }, [lastFocusedItem, selectedFolder, selectedModel, selectedModelIds]);

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      const intent = getMouseNavigationIntent(event.button);

      if (!intent) {
        return;
      }

      event.preventDefault();

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
  }, [folderHistory, selectedFolder]);

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
    setSelectedFolder(ALL_FOLDERS_ID);
    setFolderHistory(createFolderNavigationHistory());
    setSelectedModel(null);
    setSelectedModelIds(new Set());
    setLastSelectedModelId(null);
  }

  async function saveSettings(nextSettings: AppSettings) {
    const savedSettings = await window.modelLibrary.saveSettings(nextSettings);
    setSettings(savedSettings);
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
      slicers: settings.slicers.map((item) =>
        item.id === slicer.id ? { ...item, executablePath, enabled: true } : item
      )
    });
  }

  async function launchSlicer(slicerId: string, modelPath: string) {
    const result = await window.modelLibrary.launchSlicer(slicerId, modelPath);
    setLaunchMessage(result.message);

    if (result.ok) {
      setLibraryMetadata(await window.modelLibrary.getLibraryMetadata());
    }
  }

  async function toggleFavorite(modelPath: string) {
    setLibraryMetadata(await window.modelLibrary.toggleFavorite(modelPath));
  }

  async function setModelTags(modelPath: string, tags: string[]) {
    setLibraryMetadata(await window.modelLibrary.setModelTags(modelPath, tags));
  }

  async function setModelNotes(modelPath: string, notes: string) {
    setLibraryMetadata(await window.modelLibrary.setModelNotes(modelPath, notes));
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

  async function editModelTags(model: ModelFile) {
    setModelContextMenu(null);
    const currentTags = libraryMetadata.models[model.absolutePath]?.tags.join(", ") ?? "";
    const nextTags = await requestTextInput({
      title: "Editar tags",
      label: "Tags separadas por virgula",
      initialValue: currentTags,
      placeholder: "fidget, suporte, cosplay",
      confirmLabel: "Salvar tags"
    });

    if (nextTags === null) {
      return;
    }

    await setModelTags(
      model.absolutePath,
      nextTags.split(",").map((tag) => tag.trim())
    );
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

    setLibraryMetadata(await window.modelLibrary.addCatalogTag(tag));
  }

  async function createAndApplyTagToModel(model: ModelFile) {
    setModelContextMenu(null);
    const tag = await requestTextInput({
      title: "Nova tag",
      label: "Nome da tag",
      placeholder: "ex: suporte",
      confirmLabel: "Criar e aplicar"
    });

    if (!tag?.trim()) {
      return;
    }

    await window.modelLibrary.addCatalogTag(tag);
    const currentTags = libraryMetadata.models[model.absolutePath]?.tags ?? [];
    setLibraryMetadata(await window.modelLibrary.setModelTags(model.absolutePath, [...currentTags, tag]));
  }

  async function removeCatalogTag(tag: string) {
    setLibraryMetadata(await window.modelLibrary.removeCatalogTag(tag));
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

  async function toggleModelCatalogTag(model: ModelFile, tag: string) {
    const currentTags = libraryMetadata.models[model.absolutePath]?.tags ?? [];
    const nextTags = currentTags.includes(tag)
      ? currentTags.filter((currentTag) => currentTag !== tag)
      : [...currentTags, tag];

    setLibraryMetadata(await window.modelLibrary.setModelTags(model.absolutePath, nextTags));
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

  function startDraggingModel(model: ModelFile) {
    setLastFocusedItem("model");
    setFolderContextMenu(null);
    setModelContextMenu(null);
    const ids = selectedModelIds.has(model.id) ? [...selectedModelIds] : [model.id];
    setDraggedModelIds(ids);

    if (!selectedModelIds.has(model.id)) {
      setSelectedModelIds(new Set([model.id]));
      setSelectedModel(model);
      setLastSelectedModelId(model.id);
    }
  }

  function clearDraggedModels() {
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
      selectFolder(destinationLabel);
      return {
        message: result.message,
        selectedPaths: [],
        action: createActionLogEntry("Pasta renomeada", `${folderId} -> ${destinationLabel}`, [
          {
            sourcePath: result.path ?? buildFolderPath(settings.libraryPath ?? "", destinationLabel),
            destinationPath: sourcePath
          }
        ])
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
      return {
        message: result.message,
        selectedPaths: result.path ? [result.path] : [],
        action: result.path
          ? createActionLogEntry("Arquivo renomeado", `${selectedModel.name} -> ${nextName}`, [
              { sourcePath: result.path, destinationPath: previousPath }
            ])
          : undefined
      };
    });
  }

  async function moveDraggedModels(destinationFolder: string) {
    if (!settings?.libraryPath || draggedModelIds.length === 0) {
      return;
    }

    await moveModelsToFolderByIds(draggedModelIds, destinationFolder);
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

    const confirmed = window.confirm(
      `Mover ${modelsToTrash.length} arquivo${modelsToTrash.length === 1 ? "" : "s"} para a Lixeira?`
    );

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

  if (isLoading) {
    return (
      <main className="first-run">
        <div>
          <p className="eyebrow">Carregando</p>
          <h1>Preparando biblioteca</h1>
        </div>
      </main>
    );
  }

  if (!settings?.libraryPath) {
    return <FirstRun onChooseFolder={chooseFolder} />;
  }

  const models = scanResult?.models ?? [];
  const folders = buildFolderTree(models, scanResult?.folders ?? []);
  const folderCards = getGridFolderCards(
    folders,
    models,
    selectedFolder,
    settings.includeSubfolders
  );
  const availableTags = getAvailableTags(models, libraryMetadata);
  const duplicateModelIds = getDuplicateModelIds(models, modelHashes);
  const enabledSlicers = settings.slicers.filter((slicer) => slicer.enabled && slicer.executablePath);
  const filteredModels = filterModels(
    models,
    selectedFolder,
    settings.includeSubfolders,
    searchQuery,
    {
      type: typeFilter,
      sort: sortMode,
      onlySelected,
      selectedIds: selectedModelIds,
      onlyDuplicates,
      duplicateIds: duplicateModelIds,
      onlyFavorites,
      selectedTags: [...selectedTagFilters],
      metadataByPath: libraryMetadata.models
    }
  );

  return (
    <main className="app-shell">
      <FolderTree
        folders={folders}
        selectedFolder={selectedFolder}
        includeSubfolders={settings.includeSubfolders}
        modelCount={models.length}
        selectedModelCount={selectedModelIds.size}
        canMoveModels={draggedModelIds.length > 0}
        expandedFolderIds={expandedFolderIds}
        onSelectFolder={selectFolder}
        onToggleFolder={toggleExpandedFolder}
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
        availableTags={availableTags}
        selectedTags={selectedTagFilters}
        metadataByPath={libraryMetadata.models}
        duplicateModelIds={duplicateModelIds}
        isScanning={isScanning}
        canMoveModels={draggedModelIds.length > 0}
        operationMessage={operationMessage}
        selectedFolder={selectedFolder}
        viewMode={modelViewMode}
        canNavigateBack={folderHistory.back.length > 0}
        canNavigateForward={folderHistory.forward.length > 0}
        onSearchChange={setSearchQuery}
        onTypeFilterChange={setTypeFilter}
        onSortModeChange={setSortMode}
        onOnlySelectedChange={setOnlySelected}
        onOnlyFavoritesChange={setOnlyFavorites}
        onOnlyDuplicatesChange={setOnlyDuplicates}
        onToggleTagFilter={toggleTagFilter}
        onViewModeChange={setModelViewMode}
        onNavigateBack={goBackFolder}
        onNavigateForward={goForwardFolder}
        onOpenFolder={selectFolder}
        onOpenFolderContextMenu={openFolderContextMenu}
        onMoveModelsToFolder={moveDraggedModels}
        onOpenModel={openModel}
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
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLaunchSlicer={launchSlicer}
        onRenameModelFile={renameSelectedModel}
        onShowModelInFolder={(modelPath) => window.modelLibrary.showModelInFolder(modelPath)}
        onToggleFavorite={toggleFavorite}
        onSetModelTags={setModelTags}
        onSetModelNotes={setModelNotes}
        onCreateTag={addCatalogTag}
      />
      {isSettingsOpen ? (
        <SettingsDialog
          settings={settings}
          tagCatalog={libraryMetadata.tagCatalog}
          onClose={() => setIsSettingsOpen(false)}
          onSaveSettings={saveSettings}
          onChooseLibraryFolder={chooseFolder}
          onChooseSlicerExecutable={chooseSlicerExecutable}
          onAddCatalogTag={addCatalogTag}
          onRemoveCatalogTag={removeCatalogTag}
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
      {folderContextMenu ? (
        <div
          className="context-menu"
          style={{ left: folderContextMenu.x, top: folderContextMenu.y }}
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
            <button type="button" role="menuitem" onClick={() => renameFolder(folderContextMenu.folderId)}>
              Renomear
            </button>
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
              <div className="context-menu-section-title">Historico</div>
              <button type="button" role="menuitem" onClick={undoLastAction}>
                Desfazer ultima acao
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
            Configuracoes
          </button>
        </div>
      ) : null}
      {modelContextMenu ? (
        <div
          className="context-menu"
          style={{ left: modelContextMenu.x, top: modelContextMenu.y }}
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
          {libraryMetadata.tagCatalog.length > 0 ? (
            libraryMetadata.tagCatalog.map((tag) => {
              const hasTag =
                libraryMetadata.models[modelContextMenu.model.absolutePath]?.tags.includes(tag) ?? false;

              return (
                <button
                  className={`context-menu-check-item ${hasTag ? "active" : ""}`}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={hasTag}
                  key={tag}
                  onClick={() => void toggleModelCatalogTag(modelContextMenu.model, tag)}
                >
                  <span>{hasTag ? "x" : ""}</span>
                  {tag}
                </button>
              );
            })
          ) : (
            <span className="context-menu-empty">Nenhuma tag criada</span>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void createAndApplyTagToModel(modelContextMenu.model)}
          >
            Nova tag para este modelo
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void editModelTags(modelContextMenu.model)}
          >
            Editar tags
          </button>
          {enabledSlicers.length > 0 ? (
            <>
              <div className="context-menu-separator" />
              <div className="context-menu-section-title">Slicer</div>
              {enabledSlicers.map((slicer) => (
                <button
                  type="button"
                  role="menuitem"
                  key={slicer.id}
                  onClick={() => {
                    const model = modelContextMenu.model;
                    setModelContextMenu(null);
                    void launchSlicer(slicer.id, model.absolutePath);
                  }}
                >
                  Abrir no {slicer.name}
                </button>
              ))}
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
