import { describe, expect, it } from "vitest";
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
});
