import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DetailsPanel } from "../../src/components/DetailsPanel";
import type { AppSettings, ModelFile } from "../../src/shared/types";

vi.mock("../../src/components/ModelViewer", () => ({ ModelViewer: () => null }));

describe("DetailsPanel image opening", () => {
  it("catches an image-open rejection and shows an actionable message", async () => {
    const onOpenLibraryFile = vi.fn(async () => {
      throw new Error("Aplicativo padrão indisponível");
    });

    render(<DetailsPanel
      model={imageModel()}
      settings={settings()}
      modelMetadata={null}
      availableTags={[]}
      launchMessage={null}
      metadataStatus={{ availability: "ready", writable: true, source: "primary", message: null }}
      metadataWritable
      onOpenSettings={vi.fn()}
      onLaunchSlicer={vi.fn()}
      onRenameModelFile={vi.fn()}
      onShowModelInFolder={vi.fn()}
      onOpenLibraryFile={onOpenLibraryFile}
      onToggleFavorite={vi.fn()}
      onSetModelTags={vi.fn()}
      onSetModelNotes={vi.fn()}
      onRetryMetadata={vi.fn()}
      onExtractArchiveEntries={vi.fn()}
      onConvertThreeMfToStl={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir imagem" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(
      "Não foi possível abrir a imagem. Aplicativo padrão indisponível"
    ));
    expect(onOpenLibraryFile).toHaveBeenCalledOnce();
  });

  it("describes OBJ preview as geometry-only without offering slicers", () => {
    render(<DetailsPanel
      model={imageModel({ name: "helmet.obj", extension: ".obj" })}
      settings={settings()}
      modelMetadata={null}
      availableTags={[]}
      launchMessage={null}
      metadataStatus={{ availability: "ready", writable: true, source: "primary", message: null }}
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
      onExtractArchiveEntries={vi.fn()}
      onConvertThreeMfToStl={vi.fn()}
    />);

    expect(screen.getByText(/OBJ exibe somente a geometria/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Ações" }));
    expect(screen.getByText("Este tipo de arquivo não é enviado ao slicer.")).toBeTruthy();
  });
});

function imageModel(overrides: Partial<ModelFile> = {}): ModelFile {
  return {
    id: "photo",
    name: "photo.jpg",
    extension: ".jpg",
    absolutePath: "C:\\Models\\photo.jpg",
    relativeFolder: "",
    sizeBytes: 100,
    modifiedAt: "2026-09-11T12:00:00.000Z",
    dimensionsMm: null,
    objectCount: null,
    previewError: null,
    ...overrides
  };
}

function settings(): AppSettings {
  return {
    libraryPath: "C:\\Models",
    includeSubfolders: true,
    monitorLibrary: false,
    fileDragBehavior: "organize-default",
    archiveExtractorPath: "",
    defaultSlicerId: null,
    slicers: []
  };
}
