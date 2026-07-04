import { useEffect, useState } from "react";
import { DetailsPanel } from "./components/DetailsPanel";
import { FirstRun } from "./components/FirstRun";
import { FolderTree } from "./components/FolderTree";
import { ModelGrid } from "./components/ModelGrid";
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
        selectedModelId={selectedModel?.id ?? null}
        searchQuery={searchQuery}
        isScanning={isScanning}
        onSearchChange={setSearchQuery}
        onSelectModel={setSelectedModel}
        onRefresh={() => scanLibrary(settings.libraryPath ?? "")}
      />
      <DetailsPanel model={selectedModel} settings={settings} />
    </main>
  );
}

export default App;
