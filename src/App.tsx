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
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [metadataLoadingId, setMetadataLoadingId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedModel) {
      return;
    }

    if (selectedModel.dimensionsMm || selectedModel.previewError) {
      return;
    }

    let isMounted = true;
    setMetadataLoadingId(selectedModel.id);

    window.modelLibrary
      .readModelMetadata(selectedModel.absolutePath)
      .then((metadata) => {
        if (!isMounted) {
          return;
        }

        const enrichedModel = { ...selectedModel, ...metadata };
        setSelectedModel(enrichedModel);
        setScanResult((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            models: current.models.map((model) =>
              model.id === selectedModel.id ? enrichedModel : model
            )
          };
        });
      })
      .finally(() => {
        if (isMounted) {
          setMetadataLoadingId(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedModel]);

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

  async function scanLibrary(rootPath: string) {
    setIsScanning(true);

    try {
      const nextScanResult = await window.modelLibrary.scanLibrary(rootPath);
      setScanResult(nextScanResult);
      setSelectedModel((currentModel) => {
        if (!currentModel) {
          return null;
        }

        return nextScanResult.models.find((model) => model.id === currentModel.id) ?? null;
      });
    } finally {
      setIsScanning(false);
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
        onSelectFolder={setSelectedFolder}
        onToggleIncludeSubfolders={updateIncludeSubfolders}
      />
      <ModelGrid
        models={filteredModels}
        scanErrors={scanResult?.errors ?? []}
        selectedModelId={selectedModel?.id ?? null}
        searchQuery={searchQuery}
        isScanning={isScanning}
        onSearchChange={setSearchQuery}
        onSelectModel={setSelectedModel}
        onRefresh={() => scanLibrary(settings.libraryPath ?? "")}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <DetailsPanel
        model={selectedModel}
        settings={settings}
        launchMessage={launchMessage}
        isMetadataLoading={metadataLoadingId === selectedModel?.id}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLaunchSlicer={launchSlicer}
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

export default App;
