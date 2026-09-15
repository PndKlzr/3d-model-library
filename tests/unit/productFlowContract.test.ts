import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("product flow contract", () => {
  it("switches libraries through one atomic renderer activation flow", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain("async function activateLibrary(");
    expect(appSource).toContain("createLibrarySessionResetState");
    expect(appSource).toContain("window.modelLibrary.activateLibrary(rootPath");
    expect(appSource).toContain("activeLibrarySessionRef.current = activation.session");
    expect(appSource).toContain("modelThumbnailService.beginLibrarySession(");
    expect(appSource).toContain("loadLibraryViewPreferences(");
    expect(appSource).toContain("isCurrentLibraryResult(");
    expect(appSource).not.toContain("getCachedLibrary");
    expect(appSource).not.toContain("scanLibrary(rootPath");
  });

  it("settles startup loading after the initial activation completes", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const startupEffect = appSource.match(
      /useEffect\(\(\) => \{[\s\S]*?window\.modelLibrary\.getSettings\(\)[\s\S]*?\n  \}, \[\]\);/
    )?.[0];

    expect(startupEffect).toBeTruthy();
    expect(startupEffect).toContain("let isMounted = true");
    expect(startupEffect).toContain("if (isMounted) setIsLoading(false)");
  });

  it("restores the prior renderer library after activation failure", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const activationSource = appSource.match(
      /async function activateLibrary\([\s\S]*?\n  }\n/
    )?.[0];

    expect(activationSource).toBeTruthy();
    expect(activationSource).toContain("previousRendererState");
    expect(activationSource).toContain("restorePreviousLibrary");
    expect(activationSource).toContain("activationRequestRef.current");
    const recoverySource = appSource.match(
      /async function restorePreviousLibrary[\s\S]*?\n  }\n/
    )?.[0];
    expect(recoverySource).toContain("getCurrentLibrary");
    expect(recoverySource).not.toContain("activateLibrary(");
  });

  it("serializes settings mutations and preserves pending values", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const settingsSource = await readFile("src/components/SettingsDialog.tsx", "utf8");

    expect(appSource).toContain("createSettingsMutationQueue");
    expect(appSource).toContain("settingsMutationQueueRef.current.enqueue");
    expect(appSource).toContain("async function saveSettings(mutation: AppSettingsMutation)");
    expect(appSource).not.toContain("createSettingsPatch");
    expect(settingsSource).toContain("onSaveSettings: (mutation: AppSettingsMutation)");
    expect(settingsSource).toContain("setSlicerEnabled(slicer.id");
    expect(settingsSource).not.toContain("slicers: settings.slicers.map");
  });

  it("clears library-specific undo state during activation reset", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const resetSource = appSource.match(/function applyLibraryReset[\s\S]*?\n  }\n/)?.[0];

    expect(resetSource).toContain("setActionLogEntries([])");
    expect(resetSource).toContain("setUndoToast(null)");
  });

  it("keeps machine-wide preferences outside per-library storage", async () => {
    const preferencesSource = await readFile("src/lib/libraryViewPreferences.ts", "utf8");

    expect(preferencesSource).not.toContain("theme");
    expect(preferencesSource).not.toContain("fileDragBehavior");
    expect(preferencesSource).not.toContain("slicer");
    expect(preferencesSource).not.toContain("monitor");
    expect(preferencesSource).not.toContain("viewMode");
  });

  it("keeps advanced library filters in a compact popover", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");

    expect(appSource).toContain("usageFilter");
    expect(appSource).toContain("notesFilter");
    expect(appSource).toContain("tagMatchMode");
    expect(gridSource).toContain("advanced-filter-popover");
    expect(gridSource).toContain("Abertos nos últimos 30 dias");
    expect(gridSource).toContain("Nunca abertos");
    expect(gridSource).toContain("Com notas");
    expect(gridSource).toContain("Sem notas");
  });

  it("shows restrained reconciliation and monitoring feedback", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");

    expect(gridSource).toContain("Atualizando biblioteca...");
    expect(gridSource).toContain("Monitoramento ativo");
    expect(gridSource).toContain("Atualização manual");
    expect(appSource).toContain("monitorStatus");
    expect(appSource).toContain("Use o botão Atualizar");
  });
  it("organizes the right panel into preview, info, notes, and actions zones", async () => {
    const detailsSource = await readFile("src/components/DetailsPanel.tsx", "utf8");

    expect(detailsSource).toContain("details-tabs");
    expect(detailsSource).toContain("Info");
    expect(detailsSource).toContain("Notas");
    expect(detailsSource).toContain("Ações");
    expect(detailsSource).toContain('activeTab === "actions"');
  });

  it("offers grid and list modes without removing model cards", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");

    expect(appSource).toContain("MODEL_VIEW_MODE_STORAGE_KEY");
    expect(gridSource).toContain("view-mode-toggle");
    expect(gridSource).toContain("model-list");
    expect(gridSource).toContain("model-card");
  });

  it("shows lazy model thumbnail mosaics on folder cards", async () => {
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const folderThumbnailSource = await readFile(
      "src/components/FolderCardThumbnail.tsx",
      "utf8"
    );
    const stylesSource = await readFile("src/styles.css", "utf8");

    expect(gridSource).toContain("<FolderCardThumbnail models={folderCard.previewModels}");
    expect(folderThumbnailSource).toContain("IntersectionObserver");
    expect(folderThumbnailSource).toContain('request(model, "mosaic")');
    expect(folderThumbnailSource).toContain("request.release()");
    expect(folderThumbnailSource).toContain("draggable={false}");
    expect(folderThumbnailSource).toContain('data-count={thumbnailUrls.length}');
    expect(folderThumbnailSource).toContain("folder-kind-strip");
    expect(folderThumbnailSource).toContain("PASTA");
    expect(stylesSource).toContain(".folder-thumbnail-mosaic");
    expect(stylesSource).toContain(".folder-kind-strip");
  });

  it("opens a model context menu from cards and rows", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");

    expect(appSource).toContain("modelContextMenu");
    expect(appSource).toContain("openModelContextMenu");
    expect(gridSource).toContain("onOpenModelContextMenu");
    expect(gridSource).toContain("onContextMenu");
  });

  it("starts Electron native file drag directly from the card drag gesture", async () => {
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const thumbnailSource = await readFile("src/components/ModelCardThumbnail.tsx", "utf8");
    const preloadSource = await readFile("electron/preload.cjs", "utf8");
    const mainSource = await readFile("electron/main.ts", "utf8");

    expect(gridSource).toContain("draggable");
    expect(gridSource).toContain("onDragStart={(event) =>");
    expect(gridSource).toContain("event.preventDefault()");
    expect(gridSource).toContain('event.dataTransfer.setData("application/x-model-library-model"');
    expect(gridSource).not.toContain("native-file-drag-handle");
    expect(gridSource).not.toContain("GripVertical");
    expect(thumbnailSource).toContain("draggable={false}");
    expect(preloadSource).toContain('ipcRenderer.send("model:start-file-drag"');
    expect(preloadSource).not.toContain('ipcRenderer.invoke("model:start-file-drag"');
    expect(mainSource).toContain('ipcMain.on("model:start-file-drag"');
    expect(mainSource).not.toContain('ipcMain.on("model:start-file-drag", async');
    expect(mainSource).toContain("resolveDraggableFilePathsSync");
    expect(mainSource).toContain("createNativeFileDragPayload");
    expect(mainSource).toContain("model:file-drag-status");
    expect(mainSource).toContain("event.sender.startDrag");
    expect(mainSource).not.toContain("nativeShellDragHost");
  });

  it("offers a reliable context action to open selected models in a slicer", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain("launchSelectedModelsInSlicer");
    expect(appSource).toContain("Abrir selecionados no");
    expect(appSource).toContain("getSlicerLaunchModelPaths");
  });

  it("hides model context slicer actions when no printable file would be launched", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain("canLaunchContextModelInSlicer");
    expect(appSource).toContain("getSlicerLaunchModelCount(modelContextMenu.model) > 0");
  });

  it("routes file actions through shared capabilities", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const detailsSource = await readFile("src/components/DetailsPanel.tsx", "utf8");
    const archiveSource = await readFile("electron/services/archiveManager.ts", "utf8");
    const organizerSource = await readFile("electron/services/fileOrganizer.ts", "utf8");
    const mainSource = await readFile("electron/main.ts", "utf8");
    const watcherSource = await readFile("electron/services/libraryWatcher.ts", "utf8");

    expect(appSource).toContain("getSlicerLaunchFilePaths");
    expect(appSource).not.toContain("function isPrintableModel");
    expect(detailsSource).toContain("canConvertToStl(model.extension)");
    expect(archiveSource).toContain("isArchive(");
    expect(archiveSource).not.toContain("canSendToSlicer(");
    expect(archiveSource).not.toContain("ARCHIVE_EXTENSIONS");
    expect(archiveSource).not.toContain("PRINTABLE_EXTENSIONS");
    expect(organizerSource).toContain("toSupportedFileExtension(");
    expect(organizerSource).toContain("canConvertToStl(");
    expect(organizerSource).not.toContain("LIBRARY_FILE_EXTENSIONS");
    expect(mainSource).toContain("requestedPaths.filter");
    expect(mainSource).toContain('typeof modelPath !== "string"');
    expect(mainSource).toContain("canSendToSlicer(extension)");
    expect(watcherSource).toContain("toSupportedFileExtension(");
    expect(watcherSource).not.toContain("SUPPORTED_EXTENSIONS");
  });

  it("keeps internal folder organization attached to the native drag session", async () => {
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(gridSource).toContain("onMoveModelsToFolder");
    expect(gridSource).toContain("data-folder-drop-id");
    expect(gridSource).toContain("onDrop={(event) => dropOnFolder");
    expect(gridSource).toContain("shouldStartExternalFileDrag");
    expect(gridSource).toContain('behavior === "organize-default" ? event.ctrlKey : !event.shiftKey');
    expect(gridSource).toContain('onDragStartModel(model, "internal")');
    expect(gridSource).toContain('onDragStartModel(model, "external")');
    expect(gridSource).toContain("external-drag-mode-cue");
    expect(gridSource).toContain("external-drag-card-cue");
    expect(gridSource).toContain("internal-drag-mode-cue");
    expect(appSource).toContain("draggedModelIdsRef.current = internalDragIds");
    expect(appSource).toContain('if (mode === "external")');
    expect(appSource).toContain("window.modelLibrary.startFileDrag({ sessionId, filePaths })");
    expect(gridSource).not.toContain("application/x-model-library-file-drag");
  });

  it("shows internal folder drop cues only for an internal drag", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain('const internalDragIds = mode === "internal" ? ids : [];');
    expect(appSource).toContain("draggedModelIdsRef.current = internalDragIds");
    expect(appSource).toContain("setDraggedModelIds(internalDragIds)");
  });

  it("keeps filters compact and offers a single clear action", async () => {
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const stylesSource = await readFile("src/styles.css", "utf8");

    expect(gridSource).toContain("hasActiveFilters");
    expect(gridSource).toContain("clearFilters");
    expect(gridSource).toContain('aria-pressed={onlyFavorites}');
    expect(gridSource).toContain("filter-clear");
    expect(stylesSource).toContain(".filter-toggle.active");
    expect(stylesSource).toContain(".model-card:hover .card-check");
  });

  it("organizes settings into accessible workflow tabs", async () => {
    const settingsSource = await readFile("src/components/SettingsDialog.tsx", "utf8");
    const stylesSource = await readFile("src/styles.css", "utf8");

    expect(settingsSource).toContain('type SettingsTab = "library" | "organization" | "integrations" | "diagnostics"');
    expect(settingsSource).toContain('role="tablist"');
    expect(settingsSource).toContain('role="tab"');
    expect(settingsSource).toContain('role="tabpanel"');
    expect(settingsSource).toContain("Biblioteca");
    expect(settingsSource).toContain("Organização");
    expect(settingsSource).toContain("Integrações");
    expect(stylesSource).toContain(".settings-tabs");
    expect(stylesSource).toContain(".settings-content");
  });

  it("opens printable models in the default slicer on double-click", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const settingsSource = await readFile("src/components/SettingsDialog.tsx", "utf8");
    const typesSource = await readFile("src/shared/types.ts", "utf8");

    expect(typesSource).toContain("defaultSlicerId: string | null");
    expect(settingsSource).toContain("Slicer padrão");
    expect(appSource).toContain("openModelInDefaultSlicer");
    expect(appSource).toContain("settings.defaultSlicerId");
    expect(gridSource).toContain("onOpenDefaultFile");
    expect(gridSource).toContain("onDoubleClick");
  });

  it("wraps the app in an error boundary instead of allowing a blank screen", async () => {
    const mainSource = await readFile("src/main.tsx", "utf8");
    const boundarySource = await readFile("src/components/AppErrorBoundary.tsx", "utf8");

    expect(mainSource).toContain("AppErrorBoundary");
    expect(boundarySource).toContain("componentDidCatch");
    expect(boundarySource).toContain("window.location.reload");
    expect(boundarySource).toContain("app-error-screen");
  });

  it("shows file drag diagnostics in the renderer", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain("onFileDragStatus");
    expect(appSource).toContain("setOperationMessage(status.message)");
    expect(appSource).toContain('status.state !== "started"');
    expect(appSource).not.toContain("if (activeFileDragSessionRef.current) {\n      return;");
  });

  it("guards dev-only preload API drift before computing model hashes", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain('typeof window.modelLibrary.getModelHashes !== "function"');
  });

  it("shows a compact portable metadata recovery notice", async () => {
    const detailsSource = await readFile("src/components/DetailsPanel.tsx", "utf8");

    expect(detailsSource).toContain("metadataStatus");
    expect(detailsSource).toContain("metadata-recovery-notice");
    expect(detailsSource).toContain("Tentar novamente");
    expect(detailsSource).toContain("onRetryMetadata");
  });
});
