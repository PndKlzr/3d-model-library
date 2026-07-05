import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("product flow contract", () => {
  it("organizes the right panel into preview, info, notes, and actions zones", async () => {
    const detailsSource = await readFile("src/components/DetailsPanel.tsx", "utf8");

    expect(detailsSource).toContain("details-tabs");
    expect(detailsSource).toContain("Info");
    expect(detailsSource).toContain("Notas");
    expect(detailsSource).toContain("Acoes");
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

  it("opens a model context menu from cards and rows", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");

    expect(appSource).toContain("modelContextMenu");
    expect(appSource).toContain("openModelContextMenu");
    expect(gridSource).toContain("onOpenModelContextMenu");
    expect(gridSource).toContain("onContextMenu");
  });

  it("uses native Electron file drag instead of a text path payload for external slicers", async () => {
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const preloadSource = await readFile("electron/preload.cjs", "utf8");
    const mainSource = await readFile("electron/main.ts", "utf8");

    expect(gridSource).toContain('setData("application/x-model-library-model"');
    expect(gridSource).not.toContain('setData("text/plain"');
    expect(gridSource).not.toContain("event.preventDefault();\n        onDragStartModel(model);");
    expect(preloadSource).toContain('ipcRenderer.send("model:start-file-drag"');
    expect(preloadSource).not.toContain('ipcRenderer.invoke("model:start-file-drag"');
    expect(mainSource).toContain('ipcMain.on("model:start-file-drag"');
    expect(mainSource).not.toContain('ipcMain.on("model:start-file-drag", async');
    expect(mainSource).toContain("resolveDraggableFilePathsSync");
  });

  it("offers a reliable context action to open selected models in a slicer", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).toContain("launchSelectedModelsInSlicer");
    expect(appSource).toContain("Abrir selecionados no");
    expect(appSource).toContain("getSlicerLaunchModelPaths");
  });
});
