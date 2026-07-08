import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  createDefaultLibraryMetadata,
  createLibraryMetadataStore
} from "../../electron/services/libraryMetadataStore";

describe("libraryMetadataStore", () => {
  it("returns empty metadata by default", () => {
    const store = createLibraryMetadataStore();

    expect(store.getMetadata()).toEqual(createDefaultLibraryMetadata());
  });

  it("toggles a favorite model", () => {
    const store = createLibraryMetadataStore();

    store.toggleFavorite("C:/models/bench.stl");

    expect(store.getMetadata().models["C:/models/bench.stl"].favorite).toBe(true);

    store.toggleFavorite("C:/models/bench.stl");

    expect(store.getMetadata().models["C:/models/bench.stl"].favorite).toBe(false);
  });

  it("saves normalized tags for a model", () => {
    const store = createLibraryMetadataStore();

    store.setTags("C:/models/bench.stl", [" Fidget ", "fidget", "", "PLA"]);

    expect(store.getMetadata().models["C:/models/bench.stl"].tags).toEqual(["fidget", "pla"]);
    expect(store.getMetadata().tagCatalog).toEqual(["fidget", "pla"]);
  });

  it("manages a predefined tag catalog", () => {
    const store = createLibraryMetadataStore();

    store.addCatalogTag("  Cosplay ");
    store.addCatalogTag("cosplay");
    store.addCatalogTag("Fidget");
    store.removeCatalogTag("cosplay");

    expect(store.getMetadata().tagCatalog).toEqual(["fidget"]);
  });

  it("saves notes for a model", () => {
    const store = createLibraryMetadataStore();

    store.setNotes("C:/models/bench.stl", "Print at 0.16mm");

    expect(store.getMetadata().models["C:/models/bench.stl"].notes).toBe("Print at 0.16mm");
  });

  it("records slicer open history with the most recent entry first", () => {
    const store = createLibraryMetadataStore();

    store.recordSlicerOpen("C:/models/a.stl", "cura", "2026-07-04T10:00:00.000Z");
    store.recordSlicerOpen("C:/models/b.stl", "creality-print", "2026-07-04T11:00:00.000Z");

    expect(store.getMetadata().slicerHistory).toEqual([
      {
        modelPath: "C:/models/b.stl",
        slicerId: "creality-print",
        openedAt: "2026-07-04T11:00:00.000Z"
      },
      {
        modelPath: "C:/models/a.stl",
        slicerId: "cura",
        openedAt: "2026-07-04T10:00:00.000Z"
      }
    ]);
  });

  it("moves model metadata and slicer history when a file path changes", () => {
    const store = createLibraryMetadataStore();
    const oldPath = "C:/models/raw/clip.stl";
    const nextPath = "C:/models/sorted/clip.stl";

    store.toggleFavorite(oldPath);
    store.setTags(oldPath, ["fidget"]);
    store.setNotes(oldPath, "print slow");
    store.recordSlicerOpen(oldPath, "cura", "2026-07-04T12:00:00.000Z");

    store.movePathMetadata(oldPath, nextPath);

    const metadata = store.getMetadata();
    const resolvedNextPath = path.resolve(nextPath);
    expect(metadata.models[oldPath]).toBeUndefined();
    expect(metadata.models[resolvedNextPath]).toEqual({
      favorite: true,
      tags: ["fidget"],
      notes: "print slow"
    });
    expect(metadata.slicerHistory[0].modelPath).toBe(resolvedNextPath);
  });

  it("moves nested model metadata when a folder path changes", () => {
    const store = createLibraryMetadataStore();
    const folderPath = "C:/models/raw";
    const nextFolderPath = "C:/models/sorted/raw";
    const nestedPath = "C:/models/raw/sub/clip.3mf";
    const siblingPath = "C:/models/rawhide/clip.3mf";

    store.setTags(nestedPath, ["armor"]);
    store.setTags(siblingPath, ["keep"]);

    store.movePathMetadata(folderPath, nextFolderPath);

    const metadata = store.getMetadata();
    expect(metadata.models[nestedPath]).toBeUndefined();
    expect(metadata.models["C:\\models\\sorted\\raw\\sub\\clip.3mf"].tags).toEqual(["armor"]);
    expect(metadata.models[siblingPath].tags).toEqual(["keep"]);
  });
});
