import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DetailsPanel } from "../../src/components/DetailsPanel";
import { FileTypeFilter } from "../../src/components/FileTypeFilter";
import { I18nProvider } from "../../src/i18n/I18nProvider";
import { SUPPORTED_FILE_EXTENSIONS } from "../../src/shared/fileCapabilities";
import type { AppSettings } from "../../src/shared/types";

describe("localized renderer smoke", () => {
  it("switches shared controls from English to Portuguese immediately", () => {
    const view = render(
      <I18nProvider locale="en">
        <FileTypeFilter
          visibleExtensions={new Set(SUPPORTED_FILE_EXTENSIONS)}
          onChange={vi.fn()}
        />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter file types" }));
    expect(screen.getByRole("dialog", { name: "File types" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Models" })).toBeVisible();

    view.rerender(
      <I18nProvider locale="pt-BR">
        <FileTypeFilter
          visibleExtensions={new Set(SUPPORTED_FILE_EXTENSIONS)}
          onChange={vi.fn()}
        />
      </I18nProvider>
    );

    expect(screen.getByRole("button", { name: "Filtrar tipos de arquivo" })).toBeVisible();
  });

  it("renders the empty details panel in English", () => {
    render(
      <I18nProvider locale="en">
        <DetailsPanel
          model={null}
          settings={settings()}
          modelMetadata={null}
          availableTags={[]}
          launchMessage={null}
          metadataStatus={{ availability: "ready", writable: true, source: "empty", message: null }}
          metadataWritable
          onOpenSettings={vi.fn()}
          onLaunchSlicer={vi.fn()}
          onRenameModelFile={vi.fn()}
          onShowModelInFolder={vi.fn()}
          onOpenLibraryFile={vi.fn()}
          onToggleFavorite={vi.fn()}
          onSetModelTags={vi.fn()}
          onSetModelNotes={vi.fn()}
          onRetryMetadata={vi.fn()}
          onExtractArchive={vi.fn()}
          onConvertThreeMfToStl={vi.fn()}
        />
      </I18nProvider>
    );

    expect(screen.getByRole("heading", { name: "No model selected" })).toBeVisible();
    expect(screen.getByText("Select a file to view information, notes, and actions.")).toBeVisible();
  });
});

function settings(): AppSettings {
  return {
    locale: "en",
    libraryPath: "C:\\Models",
    includeSubfolders: true,
    monitorLibrary: false,
    fileDragBehavior: "organize-default",
    archiveExtractorPath: "",
    defaultSlicerId: null,
    slicers: []
  };
}
