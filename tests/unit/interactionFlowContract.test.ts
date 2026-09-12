import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { getDefaultFileOpenAction } from "../../src/lib/fileOpenAction";
import { ALL_FOLDERS_ID, filterModels } from "../../src/lib/folderFilters";
import { getDragModelIds, getDragOutFilePaths } from "../../src/lib/dragFiles";
import {
  createLibrarySessionResetState,
  isCurrentLibraryResult
} from "../../src/lib/librarySessionState";
import { SUPPORTED_FILE_EXTENSIONS } from "../../src/shared/fileCapabilities";
import type { LibrarySessionRef, ModelFile } from "../../src/shared/types";

describe("interaction flow contract", () => {
  it("routes default opening by shared file capability", () => {
    expect(getDefaultFileOpenAction(".png")).toBe("windows");
    expect(getDefaultFileOpenAction(".webp")).toBe("windows");
    expect(getDefaultFileOpenAction(".stl")).toBe("slicer");
    expect(getDefaultFileOpenAction(".3mf")).toBe("slicer");
    expect(getDefaultFileOpenAction(".obj")).toBe("preview");
    expect(getDefaultFileOpenAction(".zip")).toBe("inspect-archive");
  });

  it("keeps preview-only files inside the app instead of launching a slicer", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const openFlow = appSource.match(
      /async function openFileByDefault[\s\S]*?await openModelInDefaultSlicer\(model\);\n  }/
    )?.[0];

    expect(openFlow).toBeTruthy();
    expect(openFlow).toContain('if (action === "preview")');
    expect(openFlow).toContain("setSelectedModel(model)");
    expect(openFlow!.indexOf('if (action === "preview")'))
      .toBeLessThan(openFlow!.indexOf("await openModelInDefaultSlicer(model)"));
  });

  it("uses an in-app text dialog instead of browser prompts for file operations", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).not.toContain("window.prompt");
    expect(appSource).toContain("TextInputDialog");
    expect(appSource).toContain("requestTextInput");
  });

  it("uses an in-app confirmation dialog instead of browser confirms for trash actions", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const confirmDialogSource = await readFile("src/components/ConfirmDialog.tsx", "utf8");
    const dialogShellSource = await readFile("src/components/DialogShell.tsx", "utf8");

    expect(appSource).not.toContain("window.confirm");
    expect(appSource).toContain("ConfirmDialog");
    expect(appSource).toContain("requestConfirmation");
    expect(appSource).toContain("confirmationDialog");
    expect(appSource).toContain("Mover para Lixeira");
    expect(confirmDialogSource).toContain("DialogShell");
    expect(dialogShellSource).toContain("dialog-backdrop");
    expect(dialogShellSource).toContain("onPointerDown");
    expect(dialogShellSource).toContain("dialogRef.current?.focus()");
    expect(confirmDialogSource).toContain("danger-button");
  });

  it("confirms catalog tag removal because it affects existing model metadata", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const removeTagSource = appSource.match(
      /async function removeCatalogTag[\s\S]*?\n  }\n/
    )?.[0];

    expect(removeTagSource).toBeTruthy();
    expect(removeTagSource).toContain("requestConfirmation");
    expect(removeTagSource).toContain("Excluir tag");
    expect(removeTagSource).toContain("removeCatalogTag");
  });

  it("shows temporary undo toasts instead of an infinite action log in the grid", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");

    expect(appSource).toContain("UNDO_TOAST_TIMEOUT_MS");
    expect(appSource).toContain("undo-toast");
    expect(gridSource).not.toContain("action-log");
  });

  it("supports predefined tags from settings and model details", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const settingsSource = await readFile("src/components/SettingsDialog.tsx", "utf8");
    const detailsSource = await readFile("src/components/DetailsPanel.tsx", "utf8");
    const tagSelectorSource = await readFile("src/components/TagSelector.tsx", "utf8");
    const stylesSource = await readFile("src/styles.css", "utf8");

    expect(appSource).toContain("addCatalogTag");
    expect(appSource).toContain("removeCatalogTag");
    expect(settingsSource).toContain("tag-settings-list");
    expect(detailsSource).toContain("TagSelector");
    expect(detailsSource).not.toContain("predefined-tag-list");
    expect(detailsSource).not.toContain("tagDraft");
    expect(tagSelectorSource).toContain("Criar tag");
    expect(tagSelectorSource).toContain("role=\"listbox\"");
    expect(tagSelectorSource).toContain("aria-haspopup=\"listbox\"");
    expect(tagSelectorSource).toContain("type=\"checkbox\"");
    expect(tagSelectorSource).toContain("tag-selector-checkbox");
    expect(tagSelectorSource).toContain("onClick={() => void toggleTag(tag)}");
    expect(tagSelectorSource).toContain("selectorRef");
    expect(tagSelectorSource).toContain('document.addEventListener("pointerdown"');
    expect(tagSelectorSource).toContain('event.key === "Escape"');
    expect(stylesSource).toContain(".organization-panel .tag-selector-checkbox");
    expect(stylesSource).toContain("max-width: min(360px, calc(100vw - 32px));");
    expect(stylesSource).toContain("overflow-x: hidden");
  });

  it("keeps a persisted one-hand drag mode switch in the sticky toolbar", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const stylesSource = await readFile("src/styles.css", "utf8");

    expect(gridSource).toContain("drag-behavior-toggle");
    expect(gridSource).toContain("onFileDragBehaviorChange");
    expect(gridSource).toContain("Organizar na biblioteca");
    expect(gridSource).toContain("Enviar para outro programa");
    expect(appSource).toContain("updateFileDragBehavior");
    expect(appSource).toContain("onFileDragBehaviorChange={updateFileDragBehavior}");
    expect(stylesSource).toMatch(/\.library-sticky-header\s*\{[\s\S]*?position:\s*sticky;/);
    expect(stylesSource).toContain(".drag-behavior-toggle");
  });

  it("supports a persisted dark mode from settings", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const settingsSource = await readFile("src/components/SettingsDialog.tsx", "utf8");
    const stylesSource = await readFile("src/styles.css", "utf8");

    expect(appSource).toContain("THEME_MODE_STORAGE_KEY");
    expect(appSource).toContain("data-theme");
    expect(settingsSource).toContain("Modo escuro");
    expect(settingsSource).toContain("onThemeModeChange");
    expect(stylesSource).toContain('[data-theme="dark"]');
    expect(stylesSource).toContain('[data-theme="dark"] select option');
    expect(stylesSource).toContain("color-scheme: dark");
  });

  it("lets the search box be cleared with a dedicated button", async () => {
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const stylesSource = await readFile("src/styles.css", "utf8");

    expect(gridSource).toContain("Limpar busca");
    expect(gridSource).toContain("onSearchChange(\"\")");
    expect(gridSource).toContain("search-clear-button");
    expect(stylesSource).toContain(".search-clear-button");
  });

  it("autoscrolls the sidebar while dragging models over the folder tree edges", async () => {
    const folderTreeSource = await readFile("src/components/FolderTree.tsx", "utf8");

    expect(folderTreeSource).toContain("scrollSidebarDuringDrag");
    expect(folderTreeSource).toContain("sidebarRef");
  });

  it("can expand and collapse the whole folder tree from the sidebar", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const folderTreeSource = await readFile("src/components/FolderTree.tsx", "utf8");

    expect(appSource).toContain("expandAllFolders");
    expect(appSource).toContain("collapseAllFolders");
    expect(appSource).toContain("getAllFolderIds");
    expect(folderTreeSource).toContain("onExpandAllFolders");
    expect(folderTreeSource).toContain("onCollapseAllFolders");
    expect(folderTreeSource).toContain("Expandir todas as pastas");
    expect(folderTreeSource).toContain("Recolher todas as pastas");
  });

  it("keeps folder and disclosure icons in stable tree columns", async () => {
    const folderTreeSource = await readFile("src/components/FolderTree.tsx", "utf8");
    const stylesSource = await readFile("src/styles.css", "utf8");

    expect(folderTreeSource).toContain("folder-disclosure-placeholder");
    expect(folderTreeSource).toContain("folder-node-icon");
    expect(folderTreeSource).toContain("<FolderOpen");
    expect(folderTreeSource).toContain("<Folder size={15}");
    expect(stylesSource).toContain(".folder-node-icon");
  });

  it("lets breadcrumbs receive dragged models as folder drop targets", async () => {
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");

    expect(gridSource).toContain("onDropOnFolder");
    expect(gridSource).toContain("breadcrumb-drop-target");
    expect(gridSource).toContain("onDropOnFolder(event, ALL_FOLDERS_ID)");
  });

  it("shows archive contents and extraction actions in the details panel", async () => {
    const detailsSource = await readFile("src/components/DetailsPanel.tsx", "utf8");
    const appSource = await readFile("src/App.tsx", "utf8");
    const settingsSource = await readFile("src/components/SettingsDialog.tsx", "utf8");

    expect(detailsSource).toContain("listArchiveEntries");
    expect(detailsSource).toContain("archive-entry-list");
    expect(detailsSource).toContain("Extrair selecionados");
    expect(detailsSource).toContain("Extrair tudo");
    expect(appSource).toContain("extractArchiveEntries");
    expect(appSource).toContain("chooseArchiveExtractor");
    expect(settingsSource).toContain("Arquivos compactados");
    expect(settingsSource).toContain("onChooseArchiveExtractor");
  });

  it("offers a 3MF to STL conversion action from details", async () => {
    const detailsSource = await readFile("src/components/DetailsPanel.tsx", "utf8");
    const appSource = await readFile("src/App.tsx", "utf8");
    const workerClientSource = await readFile("src/lib/threeMfToStlWorker.ts", "utf8");
    const workerSource = await readFile("src/workers/threeMfToStl.worker.ts", "utf8");

    expect(detailsSource).toContain("Converter para STL");
    expect(detailsSource).toContain("onConvertThreeMfToStl");
    expect(detailsSource).toContain('role="progressbar"');
    expect(detailsSource).toContain("conversionProgress");
    expect(appSource).toContain("convertThreeMfToStlInWorker");
    expect(appSource).toContain("saveConvertedStl");
    expect(workerClientSource).toContain("new Worker(");
    expect(workerClientSource).toContain("worker.postMessage({ buffer }, [buffer])");
    expect(workerClientSource).toContain("worker.terminate()");
    expect(workerSource).toContain("convertThreeMfToStl");
    expect(workerSource).toContain('type: "progress"');
  });

  it("uses deferred search results so typing does not block the library grid", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain("useDeferredValue");
    expect(appSource).toContain("deferredSearchQuery");
    expect(appSource).toContain("isFilteringStale");
  });

  it("restores the activated library cache before background reconciliation", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const activationSource = appSource.match(
      /async function activateLibrary\([\s\S]*?\n  }\n/
    )?.[0];

    expect(activationSource).toBeTruthy();
    expect(activationSource).toContain("activation.cachedResult");
    expect(activationSource?.indexOf("activation.cachedResult")).toBeLessThan(
      activationSource?.indexOf("scanLibrarySession(activation.session)") ?? -1
    );
  });

  it("defines the transient state reset used by library activation", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const activationSource = appSource.match(
      /async function activateLibrary\([\s\S]*?\n  }\n/
    )?.[0];
    const reset = createLibrarySessionResetState();

    expect(reset).toMatchObject({
      scanResult: null,
      selectedModel: null,
      selectedFolder: ALL_FOLDERS_ID,
      searchQuery: "",
      folderContextMenu: null,
      modelContextMenu: null,
      previewModel: null
    });
    expect(reset.selectedModelIds.size).toBe(0);
    expect(reset.folderHistory).toEqual({ back: [], forward: [] });
    expect(activationSource).toBeTruthy();
    expect(activationSource!.indexOf("applyLibraryReset()"))
      .toBeLessThan(activationSource!.indexOf("await window.modelLibrary.activateLibrary"));
    expect(activationSource!.indexOf("modelThumbnailService.beginLibrarySession"))
      .toBeLessThan(activationSource!.indexOf("setScanResult(activation.cachedResult)"));
  });

  it("accepts asynchronous results only for the active session identity", () => {
    const active: LibrarySessionRef = {
      generation: 7,
      libraryId: "library-a",
      rootPath: "C:\\LibraryA"
    };

    expect(isCurrentLibraryResult(active, { ...active })).toBe(true);
    expect(isCurrentLibraryResult(active, { ...active, generation: 6 })).toBe(false);
    expect(isCurrentLibraryResult(active, { ...active, libraryId: "library-b" })).toBe(false);
    expect(isCurrentLibraryResult(active, { ...active, rootPath: "C:\\LibraryB" })).toBe(false);
    expect(isCurrentLibraryResult(null, active)).toBe(false);
  });

  it("composes catalog filters in memory", () => {
    const now = Date.parse("2026-09-12T12:00:00.000Z");
    const target = contractModel("target.obj", ".obj", "keep", 200);
    const files = [
      target,
      contractModel("wrong-type.stl", ".stl", "keep", 900),
      contractModel("excluded.obj", ".obj", "excluded/nested", 800),
      contractModel("plain.obj", ".obj", "keep", 100)
    ];
    const result = filterModels(files, ALL_FOLDERS_ID, true, "calibrated", {
      visibleExtensions: new Set([".obj"]),
      excludedFolders: ["excluded"],
      sort: "size",
      onlySelected: true,
      selectedIds: new Set([target.id, files[2].id]),
      onlyDuplicates: true,
      duplicateIds: new Set([target.id, files[3].id]),
      onlyFavorites: true,
      selectedTags: ["fixture", "ready"],
      tagMatchMode: "all",
      usageFilter: "recent",
      notesFilter: "with-notes",
      now,
      slicerHistory: [{
        modelPath: target.absolutePath,
        slicerId: "slicer-a",
        openedAt: "2026-09-11T12:00:00.000Z"
      }],
      metadataByPath: {
        [target.absolutePath]: {
          favorite: true,
          tags: ["fixture", "ready"],
          notes: "calibrated"
        }
      }
    });

    expect(result).toEqual([target]);
  });

  it("keeps every supported format available to internal and external drag selection", () => {
    const files = SUPPORTED_FILE_EXTENSIONS.map((extension, index) =>
      contractModel(`file-${index}${extension}`, extension, "", index + 1)
    );
    const selectedIds = new Set(files.map((file) => file.id));

    expect(getDragModelIds(files[0], files, selectedIds)).toEqual(files.map((file) => file.id));
    expect(getDragOutFilePaths(files[0], files, selectedIds)).toEqual(
      files.map((file) => file.absolutePath)
    );
  });

  it("does not create undo restore pairs for no-op renames", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain("createRenameRestorePairs");
    expect(appSource).toContain("return samePath(nextPath, previousPath)");
    expect(appSource).toContain(": [{ sourcePath: nextPath, destinationPath: previousPath }]");
  });

  it("migrates saved model metadata when files or folders are moved and renamed", async () => {
    const mainSource = await readFile("electron/main.ts", "utf8");
    const metadataStoreSource = await readFile("electron/services/libraryMetadataStore.ts", "utf8");

    expect(metadataStoreSource).toContain("movePathMetadata");
    expect(mainSource).toContain("libraryMetadataStore.movePathMetadata");
    expect(mainSource).toContain('"library:move-models"');
    expect(mainSource).toContain('"library:restore-paths"');
  });

  it("refreshes renderer metadata after file operations that can move paths", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const runOperationSource = appSource.match(
      /async function runLibraryOperation[\s\S]*?\n  }\n/
    )?.[0];

    expect(runOperationSource).toBeTruthy();
    expect(runOperationSource).toContain("getLibraryMetadata");
    expect(runOperationSource).toContain("setLibraryMetadata");
  });

  it("refreshes renderer metadata after undo restores paths", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const undoSource = appSource.match(/async function undoLastAction[\s\S]*?\n  }\n/)?.[0];

    expect(undoSource).toBeTruthy();
    expect(undoSource).toContain("getLibraryMetadata");
    expect(undoSource).toContain("setLibraryMetadata");
  });

  it("does not let metadata migration failures mask completed file operations", async () => {
    const mainSource = await readFile("electron/main.ts", "utf8");

    expect(mainSource).toContain("movePathMetadataSafely");
    expect(mainSource).toContain("withMetadataWarnings");
    expect(mainSource).toContain("[metadata] failed to migrate path metadata");
  });

  it("activates the saved library before the window opens", async () => {
    const mainSource = await readFile("electron/main.ts", "utf8");

    expect(mainSource).toContain("createActiveLibraryMetadataStore");
    expect(mainSource).toContain("createActiveLibrarySession");
    expect(mainSource).toContain("await activeLibrarySession.activate(");
    expect(mainSource.indexOf("await activeLibrarySession.activate(")).toBeLessThan(
      mainSource.lastIndexOf("await createWindow()")
    );
    expect(mainSource).toContain('ipcMain.handle("metadata:status"');
    expect(mainSource).toContain('ipcMain.handle("metadata:retry"');
  });

  it("routes scans and monitoring through session-scoped IPC", async () => {
    const mainSource = await readFile("electron/main.ts", "utf8");

    expect(mainSource).toContain('ipcMain.handle("library:activate"');
    expect(mainSource).toMatch(/activeLibrarySession!?\.scan\(expected\)/);
    expect(mainSource).toMatch(
      /activeLibrarySession!?\.setMonitoring\(expected, enabled === true\)/
    );
    expect(mainSource).not.toContain('ipcMain.handle("library:get-cached"');
  });

  it("authorizes runtime file operations from active B instead of saved setting A", async () => {
    const mainSource = await readFile("electron/main.ts", "utf8");
    const requireLibraryPath = mainSource.match(
      /function requireLibraryPath\(\): string \{[\s\S]*?\n\}/
    )?.[0];

    expect(requireLibraryPath).toBeTruthy();
    expect(requireLibraryPath).toContain("activeLibrarySession!.current()");
    expect(requireLibraryPath).toContain("currentSession.rootPath");
    expect(requireLibraryPath).not.toContain("settingsStore.getSettings()");
  });

  it("activates a changed library before persisting its settings", async () => {
    const mainSource = await readFile("electron/main.ts", "utf8");
    const saveHandler = mainSource.match(
      /ipcMain\.handle\("settings:save"[\s\S]*?\n  \}\);/
    )?.[0];

    expect(saveHandler).toBeTruthy();
    expect(saveHandler?.indexOf("activeLibrarySession.activate(")).toBeLessThan(
      saveHandler?.indexOf("settingsStore.saveSettings(settings)") ?? -1
    );
  });

  it("awaits portable metadata updates after move, rename, restore, and slicer launch", async () => {
    const mainSource = await readFile("electron/main.ts", "utf8");

    expect(mainSource).toContain("async function movePathMetadataSafely");
    expect(mainSource).toContain("await movePathMetadataSafely(");
    expect(mainSource).toContain("await libraryMetadataStore.recordSlicerOpen(");
  });

  it("loads portable metadata status and reports rejected durable edits", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain("metadataStatus");
    expect(appSource).toContain("getLibraryMetadataStatus");
    expect(appSource).toContain("retryLibraryMetadata");
    expect(appSource).toContain("Não foi possível salvar os dados da biblioteca");
    expect(appSource).toContain("metadataStatus.writable");
  });

  it("disables note, tag, favorite, and catalog controls when metadata is read-only", async () => {
    const detailsSource = await readFile("src/components/DetailsPanel.tsx", "utf8");
    const settingsSource = await readFile("src/components/SettingsDialog.tsx", "utf8");
    const tagSelectorSource = await readFile("src/components/TagSelector.tsx", "utf8");

    expect(detailsSource).toContain("metadataWritable");
    expect(detailsSource).toContain("disabled={!metadataWritable}");
    expect(settingsSource).toContain("metadataWritable");
    expect(tagSelectorSource).toContain("disabled = false");
    expect(tagSelectorSource).toContain("disabled={disabled}");
  });

  it("shows the complete model location with copy and Explorer actions", async () => {
    const detailsSource = await readFile("src/components/DetailsPanel.tsx", "utf8");
    const mainSource = await readFile("electron/main.ts", "utf8");

    expect(detailsSource).toContain("Localização");
    expect(detailsSource).toContain("relativeLocation");
    expect(detailsSource).toContain("Copiar caminho completo");
    expect(detailsSource).toContain("window.modelLibrary.copyText(model.absolutePath)");
    expect(detailsSource).toContain("Mostrar no Explorer");
    expect(mainSource).toContain('ipcMain.handle("system:copy-text"');
    expect(mainSource).toContain("clipboard.writeText(value)");
  });
});

function contractModel(
  name: string,
  extension: ModelFile["extension"],
  relativeFolder: string,
  sizeBytes: number
): ModelFile {
  const absolutePath = `C:\\Library\\${relativeFolder ? `${relativeFolder}\\` : ""}${name}`;
  return {
    id: absolutePath,
    name,
    extension,
    absolutePath,
    relativeFolder,
    sizeBytes,
    modifiedAt: "2026-09-12T00:00:00.000Z",
    dimensionsMm: null,
    objectCount: null,
    previewError: null
  };
}
