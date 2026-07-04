import { useEffect, useState } from "react";
import { DetailsPanel } from "./components/DetailsPanel";
import { FirstRun } from "./components/FirstRun";
import { FolderTree } from "./components/FolderTree";
import { ModelGrid } from "./components/ModelGrid";
import { SettingsDialog } from "./components/SettingsDialog";
import { buildFolderTree } from "./lib/folderTree";
import { ALL_FOLDERS_ID, filterModels } from "./lib/folderFilters";
import type { AppSettings, LibraryScanResult, ModelFile } from "./shared/types";

function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [scanResult, setScanResult] = useState<LibraryScanResult | null>(null);
  const [selectedFolder, setSelectedFolder] = useState(ALL_FOLDERS_ID);
  const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(() => new Set());
  const [draggedModelIds, setDraggedModelIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    window.modelLibrary
      .getSettings()
      .then((loadedSettings) => {
        if (isMounted) {
          setSettings(loadedSettings);
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
    setSelectedModel(null);
    setSelectedModelIds(new Set());
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

  function openModel(model: ModelFile) {
    setSelectedModel(model);

    if (!selectedModelIds.has(model.id)) {
      setSelectedModelIds(new Set([model.id]));
    }
  }

  function toggleModelSelection(model: ModelFile, selected: boolean) {
    setSelectedModel(model);
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
    const ids = selectedModelIds.has(model.id) ? [...selectedModelIds] : [model.id];
    setDraggedModelIds(ids);

    if (!selectedModelIds.has(model.id)) {
      setSelectedModelIds(new Set([model.id]));
      setSelectedModel(model);
    }
  }

  function clearDraggedModels() {
    setDraggedModelIds([]);
  }

  async function createFolder() {
    if (!settings?.libraryPath) {
      return;
    }

    const parentFolder = selectedFolder === ALL_FOLDERS_ID ? "" : selectedFolder;
    const folderName = window.prompt(
      parentFolder ? `Nova pasta dentro de ${parentFolder}` : "Nova pasta na raiz"
    );

    if (!folderName) {
      return;
    }

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.createFolder(parentFolder, folderName);
      setSelectedFolder(joinFolder(parentFolder, folderName.trim()));
      return { message: result.message, selectedPaths: [] };
    });
  }

  async function renameFolder() {
    if (!settings?.libraryPath || selectedFolder === ALL_FOLDERS_ID) {
      setOperationMessage("Selecione uma pasta para renomear.");
      return;
    }

    const currentName = selectedFolder.split("/").pop() ?? selectedFolder;
    const nextName = window.prompt("Novo nome da pasta", currentName);

    if (!nextName) {
      return;
    }

    const parentFolder = selectedFolder.split("/").slice(0, -1).join("/");

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.renameFolder(selectedFolder, nextName);
      setSelectedFolder(joinFolder(parentFolder, nextName.trim()));
      return { message: result.message, selectedPaths: [] };
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

    await runLibraryOperation(async () => {
      const result = await window.modelLibrary.renameModelFile(selectedModel.absolutePath, nextName);
      return {
        message: result.message,
        selectedPaths: result.path ? [result.path] : []
      };
    });
  }

  async function moveDraggedModels(destinationFolder: string) {
    if (!settings?.libraryPath || draggedModelIds.length === 0) {
      return;
    }

    const draggedIdSet = new Set(draggedModelIds);
    const modelsToMove = models.filter((model) => draggedIdSet.has(model.id));

    if (modelsToMove.length === 0) {
      return;
    }

    await runLibraryOperation(async () => {
      const targetFolder = destinationFolder === ALL_FOLDERS_ID ? "" : destinationFolder;
      const result = await window.modelLibrary.moveModels(
        modelsToMove.map((model) => model.absolutePath),
        targetFolder
      );

      return {
        message: result.message,
        selectedPaths: modelsToMove.map((model) =>
          buildMovedModelPath(settings.libraryPath ?? "", targetFolder, model.name)
        )
      };
    });
  }

  async function runLibraryOperation(
    operation: () => Promise<{ message: string; selectedPaths: string[] }>
  ) {
    if (!settings?.libraryPath) {
      return;
    }

    try {
      const result = await operation();
      setOperationMessage(result.message);
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
  const folders = buildFolderTree(models);
  const filteredModels = filterModels(
    models,
    selectedFolder,
    settings.includeSubfolders,
    searchQuery
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
        onSelectFolder={setSelectedFolder}
        onToggleIncludeSubfolders={updateIncludeSubfolders}
        onCreateFolder={createFolder}
        onRenameFolder={renameFolder}
        onMoveModelsToFolder={moveDraggedModels}
      />
      <ModelGrid
        models={filteredModels}
        scanErrors={scanResult?.errors ?? []}
        selectedModelId={selectedModel?.id ?? null}
        selectedModelIds={selectedModelIds}
        searchQuery={searchQuery}
        isScanning={isScanning}
        operationMessage={operationMessage}
        onSearchChange={setSearchQuery}
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
        launchMessage={launchMessage}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLaunchSlicer={launchSlicer}
        onRenameModelFile={renameSelectedModel}
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

function readErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lastError = message.split("Error: ").pop();
  return lastError || message;
}

export default App;
