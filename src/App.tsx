import { useEffect, useState } from "react";
import { DetailsPanel } from "./components/DetailsPanel";
import { FirstRun } from "./components/FirstRun";
import { FolderTree } from "./components/FolderTree";
import { ModelGrid } from "./components/ModelGrid";
import { SettingsDialog } from "./components/SettingsDialog";
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
import type {
  AppSettings,
  FileRestorePair,
  LibraryActionLogEntry,
  LibraryMetadata,
  LibraryScanResult,
  ModelFile
} from "./shared/types";

const EXPANDED_FOLDERS_STORAGE_KEY = "model-library-expanded-folders";

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
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() =>
    readExpandedFolders()
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
    slicerHistory: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [actionLogEntries, setActionLogEntries] = useState<LocalActionLogEntry[]>([]);

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
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFolderContextMenu(null);
        return;
      }

      if (event.key !== "F2" || isTextInputTarget(event.target)) {
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
  }, [lastFocusedItem, selectedFolder, selectedModel]);

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

  function selectFolder(folderId: string) {
    setFolderHistory((currentHistory) =>
      pushFolderHistory(currentHistory, selectedFolder, folderId)
    );
    navigateToFolder(folderId);
  }

  function navigateToFolder(folderId: string) {
    setLastFocusedItem("folder");
    setFolderContextMenu(null);
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

  function toggleModelSelection(model: ModelFile, selected: boolean) {
    setLastFocusedItem("model");
    setFolderContextMenu(null);
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

    if (!settings?.libraryPath) {
      return;
    }

    const parentFolderId = parentFolderOverride ?? selectedFolder;
    const parentFolder = parentFolderId === ALL_FOLDERS_ID ? "" : parentFolderId;
    const folderName = window.prompt(
      parentFolder ? `Nova pasta dentro de ${parentFolder}` : "Nova pasta na raiz"
    );

    if (!folderName) {
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

    if (!settings?.libraryPath || folderId === ALL_FOLDERS_ID) {
      setOperationMessage("Selecione uma pasta para renomear.");
      return;
    }

    const currentName = folderId.split("/").pop() ?? folderId;
    const nextName = window.prompt("Novo nome da pasta", currentName);

    if (!nextName) {
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
    if (!selectedModel || !settings?.libraryPath) {
      return;
    }

    const nextName = window.prompt("Novo nome do arquivo", selectedModel.name);

    if (!nextName) {
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
  const folderCards = getGridFolderCards(folders, models, selectedFolder);
  const availableTags = getAvailableTags(models, libraryMetadata);
  const duplicateModelIds = getDuplicateModelIds(models);
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
        actionLogEntries={actionLogEntries}
        selectedFolder={selectedFolder}
        canNavigateBack={folderHistory.back.length > 0}
        canNavigateForward={folderHistory.forward.length > 0}
        onSearchChange={setSearchQuery}
        onTypeFilterChange={setTypeFilter}
        onSortModeChange={setSortMode}
        onOnlySelectedChange={setOnlySelected}
        onOnlyFavoritesChange={setOnlyFavorites}
        onOnlyDuplicatesChange={setOnlyDuplicates}
        onToggleTagFilter={toggleTagFilter}
        onNavigateBack={goBackFolder}
        onNavigateForward={goForwardFolder}
        onOpenFolder={selectFolder}
        onOpenFolderContextMenu={openFolderContextMenu}
        onMoveModelsToFolder={moveDraggedModels}
        onOpenModel={openModel}
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
        launchMessage={launchMessage}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLaunchSlicer={launchSlicer}
        onRenameModelFile={renameSelectedModel}
        onShowModelInFolder={(modelPath) => window.modelLibrary.showModelInFolder(modelPath)}
        onToggleFavorite={toggleFavorite}
        onSetModelTags={setModelTags}
        onSetModelNotes={setModelNotes}
      />
      {isSettingsOpen ? (
        <SettingsDialog
          settings={settings}
          onClose={() => setIsSettingsOpen(false)}
          onSaveSettings={saveSettings}
          onChooseLibraryFolder={chooseFolder}
          onChooseSlicerExecutable={chooseSlicerExecutable}
        />
      ) : null}
      {folderContextMenu ? (
        <div
          className="context-menu"
          style={{ left: folderContextMenu.x, top: folderContextMenu.y }}
          role="menu"
          onMouseLeave={() => setFolderContextMenu(null)}
        >
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
              <button type="button" role="menuitem" onClick={undoLastAction}>
                Desfazer ultima acao
              </button>
            </>
          ) : null}
          <div className="context-menu-separator" />
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
  const tags = new Set<string>();

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
