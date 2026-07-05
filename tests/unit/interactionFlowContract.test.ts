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

    expect(appSource).toContain("addCatalogTag");
    expect(appSource).toContain("removeCatalogTag");
    expect(settingsSource).toContain("tag-settings-list");
    expect(detailsSource).toContain("predefined-tag-list");
  });

  it("autoscrolls the sidebar while dragging models over the folder tree edges", async () => {
    const folderTreeSource = await readFile("src/components/FolderTree.tsx", "utf8");

    expect(folderTreeSource).toContain("scrollSidebarDuringDrag");
    expect(folderTreeSource).toContain("sidebarRef");
  });
});
