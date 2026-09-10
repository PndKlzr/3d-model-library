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
    expect(appSource).toContain("Pasta");
    expect(appSource).toContain("Organizar");
    expect(appSource).toContain("Mover pasta");
    expect(appSource).toContain("Mover pasta para Lixeira");
    expect(appSource).toContain("Tags");
    expect(appSource).toContain("Desfazer última ação");
  });

  it("opens model tags through the unified tag selector instead of inline tag actions", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain("tagPickerDialog");
    expect(appSource).toContain("Tags...");
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
    expect(appSource).toContain("Tentar miniatura novamente");
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
});
