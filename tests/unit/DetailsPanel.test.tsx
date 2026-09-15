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
      onExtractArchive={vi.fn()}
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
      onExtractArchive={vi.fn()}
      onConvertThreeMfToStl={vi.fn()}
    />);

    expect(screen.getByText(/OBJ exibe somente a geometria/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Ações" }));
    expect(screen.getByText("Este tipo de arquivo não é enviado ao slicer.")).toBeTruthy();
  });

  it("offers conversion and slicer actions only to capable model formats", () => {
    const configuredSettings = settings();
    configuredSettings.slicers = [{
      id: "cura",
      name: "Cura",
      executablePath: "C:\\Cura.exe",
      enabled: true
    }];

    const { rerender } = render(<DetailsPanel
      model={imageModel({ name: "project.3mf", extension: ".3mf" })}
      settings={configuredSettings}
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
      onExtractArchive={vi.fn()}
      onConvertThreeMfToStl={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("tab", { name: "Ações" }));
    expect(screen.getByRole("button", { name: "Converter para STL" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abrir no Cura" })).toBeTruthy();

    rerender(<DetailsPanel
      model={imageModel({ name: "part.stl", extension: ".stl" })}
      settings={configuredSettings}
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
      onExtractArchive={vi.fn()}
      onConvertThreeMfToStl={vi.fn()}
    />);
    fireEvent.click(screen.getByRole("tab", { name: "Ações" }));
    expect(screen.queryByRole("button", { name: "Converter para STL" })).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir no Cura" })).toBeTruthy();
  });

  it("shows complete archive contents and the two whole-archive extraction modes", async () => {
    const onExtractArchive = vi.fn(async () => undefined);
    window.modelLibrary = {
      listArchiveEntries: vi.fn(async () => ({
        ok: true,
        archivePath: "C:\\Models\\pack.zip",
        entries: [
          { path: "docs", name: "docs", extension: "", sizeBytes: 0, isDirectory: true },
          { path: "docs/readme.pdf", name: "readme.pdf", extension: ".pdf", sizeBytes: 12 },
          { path: "preview.jpg", name: "preview.jpg", extension: ".jpg", sizeBytes: 20 }
        ]
      }))
    } as unknown as Window["modelLibrary"];

    render(<DetailsPanel
      model={imageModel({ name: "pack.zip", extension: ".zip" })}
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
      onExtractArchive={onExtractArchive}
      onConvertThreeMfToStl={vi.fn()}
    />);

    expect(await screen.findByText("docs/readme.pdf")).toBeTruthy();
    expect(screen.getByText("preview.jpg")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Extrair aqui" }));
    fireEvent.click(screen.getByRole("button", { name: /Extrair para pack/i }));
    expect(onExtractArchive).toHaveBeenNthCalledWith(1, "C:\\Models\\photo.jpg", "here");
    expect(onExtractArchive).toHaveBeenNthCalledWith(2, "C:\\Models\\photo.jpg", "named-folder");
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
