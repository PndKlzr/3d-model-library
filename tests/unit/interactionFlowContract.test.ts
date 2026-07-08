import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("interaction flow contract", () => {
  it("uses an in-app text dialog instead of browser prompts for file operations", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).not.toContain("window.prompt");
    expect(appSource).toContain("TextInputDialog");
    expect(appSource).toContain("requestTextInput");
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
    expect(tagSelectorSource).toContain("type=\"checkbox\"");
    expect(tagSelectorSource).toContain("tag-selector-checkbox");
    expect(tagSelectorSource).toContain("onClick={() => void toggleTag(tag)}");
    expect(stylesSource).toContain(".organization-panel .tag-selector-checkbox");
    expect(stylesSource).toContain("overflow-x: hidden");
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
  });

  it("autoscrolls the sidebar while dragging models over the folder tree edges", async () => {
    const folderTreeSource = await readFile("src/components/FolderTree.tsx", "utf8");

    expect(folderTreeSource).toContain("scrollSidebarDuringDrag");
    expect(folderTreeSource).toContain("sidebarRef");
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

    expect(detailsSource).toContain("Converter para STL");
    expect(detailsSource).toContain("onConvertThreeMfToStl");
    expect(appSource).toContain("convertThreeMfToStl");
    expect(appSource).toContain("saveConvertedStl");
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
});
