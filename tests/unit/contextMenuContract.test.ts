import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("folder context menu contract", () => {
  it("does not change the open folder when showing the context menu", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const contextMenuHandler = appSource.match(
      /function openFolderContextMenu[\s\S]*?\n  }\n/
    )?.[0];

    expect(contextMenuHandler).toBeTruthy();
    expect(contextMenuHandler).not.toContain("setSelectedFolder");
  });

  it("keeps organization actions in grouped context menus", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain("context-menu-section-title");
    expect(appSource).toContain('t("context.folder")');
    expect(appSource).toContain('t("context.organize")');
    expect(appSource).toContain('t("context.moveFolder")');
    expect(appSource).toContain('t("context.trashFolder")');
    expect(appSource).toContain('t("context.tags")');
    expect(appSource).toContain('t("context.undoLast")');
  });

  it("opens model tags through the unified tag selector instead of inline tag actions", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain("tagPickerDialog");
    expect(appSource).toContain('t("context.tags")');
    expect(appSource).not.toContain("context-menu-check-item");
    expect(appSource).not.toContain("Editar tags");
  });

  it("retries and remounts only the context model thumbnail", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");

    const retryHandler = appSource.match(/function retryModelThumbnail[\s\S]*?\n  }\n/)?.[0];
    expect(retryHandler).toBeTruthy();
    expect(retryHandler).toContain("modelThumbnailService.retry(model)");
    expect(retryHandler).toContain("setModelContextMenu(null)");
    expect(appSource).toContain('t("context.retryThumbnail")');
    expect(appSource).toContain("thumbnailRetryGenerations={thumbnailRetryGenerations}");
    expect(gridSource).toContain("key={thumbnailRetryGeneration}");
  });

  it("clamps context menus to the viewport", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const stylesSource = await readFile("src/styles.css", "utf8");

    expect(appSource).toContain("getContextMenuPosition");
    expect(appSource).toContain("getContextMenuStyle");
    expect(stylesSource).toContain("max-height: calc(100vh - 24px)");
    expect(stylesSource).toContain("overflow-y: auto");
  });

  it("supports Delete as a trash shortcut without hijacking text inputs", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const keyHandler = appSource.match(/function handleKeyDown[\s\S]*?\n    }\n/)?.[0];

    expect(keyHandler).toBeTruthy();
    expect(keyHandler).toContain('event.key === "Delete"');
    expect(keyHandler).toContain("isTextInputTarget");
    expect(keyHandler).toContain("trashSelectedModels");
  });

  it("closes overlays before using keyboard or mouse back navigation", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain("closeTopOverlay");
    expect(appSource).toContain("textInputDialog");
    expect(appSource).toContain('event.key === "Escape"');
    expect(appSource).toContain('intent === "back"');
  });

  it("autoscrolls the sidebar while dragging over its empty space", async () => {
    const folderTreeSource = await readFile("src/components/FolderTree.tsx", "utf8");

    expect(folderTreeSource).toContain("onDragOver={scrollSidebarDuringDrag}");
    expect(folderTreeSource).toContain("onDragLeave={() => setDragOverFolder(null)}");
  });

  it("hides non-root folders from results without removing them from navigation", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const folderTreeSource = await readFile("src/components/FolderTree.tsx", "utf8");

    expect(appSource).toContain('t("context.hideResults")');
    expect(appSource).toContain("folderContextMenu.folderId !== ALL_FOLDERS_ID");
    expect(folderTreeSource).toContain("excludedFolderIds");
    expect(folderTreeSource).toContain("folder-excluded-indicator");
  });

  it("reveals root and nested folders after closing the context menu", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const revealHandler = appSource.match(/async function showFolderInExplorer[\s\S]*?\n  }\n/)?.[0];

    expect(revealHandler).toBeTruthy();
    expect(revealHandler).toContain("runAfterCommittedUpdate");
    expect(revealHandler).toContain("() => setFolderContextMenu(null)");
    expect(revealHandler).toContain("ALL_FOLDERS_ID ? \"\" : folderId");
    expect(revealHandler).toContain("showLibraryFolder(session, relativeFolder)");
    expect(appSource).toContain('t("details.showExplorer")');
    expect(appSource).toContain("showModelInFolder(model.absolutePath)");
  });

  it("opens a model's containing folder inside the library without changing type preferences", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const handler = appSource.match(
      /function viewModelFolderInLibrary[\s\S]*?\n  }\n/
    )?.[0];

    expect(handler).toBeTruthy();
    expect(handler).toContain("setSearchQuery(\"\")");
    expect(handler).toContain("setOnlySelected(false)");
    expect(handler).toContain("setOnlyFavorites(false)");
    expect(handler).toContain("setOnlyDuplicates(false)");
    expect(handler).toContain("setSelectedTagFilters(new Set())");
    expect(handler).toContain("selectFolder(model.relativeFolder || ALL_FOLDERS_ID)");
    expect(handler).not.toContain("updateVisibleExtensions");
    expect(appSource).toContain('t("context.viewFolder")');
  });

  it("converts only the context-clicked 3MF and reports progress", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const handler = appSource.match(
      /async function convertContextModelToStl[\s\S]*?\n  }/
    )?.[0];

    expect(handler).toBeTruthy();
    expect(handler).toContain("setModelContextMenu(null)");
    expect(handler).toContain("convertSelectedThreeMfToStl(model.absolutePath");
    expect(handler).toContain('t("details.converting")');
    expect(appSource).toContain("canConvertToStl(modelContextMenu.model.extension)");
    expect(appSource).toContain('t("details.convertToStl")');
    expect(appSource).toContain("convertContextModelToStl(modelContextMenu.model)");
  });
});
