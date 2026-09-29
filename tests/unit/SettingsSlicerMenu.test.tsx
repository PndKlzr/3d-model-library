import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../../electron/services/settingsStore";
import { SettingsDialog } from "../../src/components/SettingsDialog";
import { I18nProvider } from "../../src/i18n/I18nProvider";
import { createThumbnailDiagnostics } from "../../src/lib/thumbnailDiagnostics";

describe("slicer actions inside settings", () => {
  it("closes an open slicer menu before closing settings with Escape", () => {
    const onClose = vi.fn();
    renderSettings(onClose);

    fireEvent.click(screen.getByRole("tab", { name: "Integrações" }));
    fireEvent.click(screen.getByRole("button", { name: "Ações de UltiMaker Cura" }));
    expect(screen.getByRole("menuitem", { name: "Trocar executável" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: "Trocar executável" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not keep a hidden menu open after changing tabs", () => {
    const onClose = vi.fn();
    renderSettings(onClose);
    fireEvent.click(screen.getByRole("tab", { name: "Integrações" }));
    fireEvent.click(screen.getByRole("button", { name: "Ações de UltiMaker Cura" }));
    fireEvent.click(screen.getByRole("tab", { name: "Biblioteca" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

function renderSettings(onClose: () => void) {
  render(<I18nProvider locale="pt-BR"><SettingsDialog
    settings={createDefaultSettings("pt-BR")}
    tagCatalog={[]}
    metadataWritable={true}
    metadataMessage={null}
    thumbnailDiagnostics={createThumbnailDiagnostics().getSnapshot()}
    onClose={onClose}
    onSaveSettings={vi.fn(async () => undefined)}
    onChooseLibraryFolder={vi.fn(async () => undefined)}
    onChooseArchiveExtractor={vi.fn(async () => undefined)}
    onChooseSlicerExecutable={vi.fn(async () => undefined)}
    detectingSlicers={false}
    unavailableSlicerIds={[]}
    onDetectSlicers={vi.fn(async () => undefined)}
    onAddSlicer={vi.fn(async () => undefined)}
    onRenameSlicer={vi.fn(async () => undefined)}
    onRemoveSlicer={vi.fn(async () => undefined)}
    onAddCatalogTag={vi.fn(async () => undefined)}
    onRemoveCatalogTag={vi.fn(async () => undefined)}
    themeMode="light"
    onThemeModeChange={vi.fn()}
    libraryDataStatus={{
      libraryId: "library-a",
      updatedAt: null,
      availability: "ready",
      writable: true,
      source: "primary",
      modelCount: 0,
      tagCount: 0
    }}
    libraryHealth={{ checkedAt: null, counts: { warning: 0, error: 0 }, issues: [] }}
    maintenanceBusyAction={null}
    onExportLibraryBackup={vi.fn(async () => undefined)}
    onRestoreLibraryBackup={vi.fn(async () => undefined)}
    onOpenLibraryDataFolder={vi.fn(async () => undefined)}
    onVerifyLibrary={vi.fn(async () => undefined)}
    onRebuildLibraryIndex={vi.fn(async () => undefined)}
    onCleanUnusedThumbnails={vi.fn(async () => undefined)}
    onRetryThumbnailPath={vi.fn()}
  /></I18nProvider>);
}
