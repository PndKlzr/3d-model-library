import { describe, expect, it } from "vitest";
import { buildLibraryHealthSnapshot } from "../../src/lib/libraryHealth";

describe("libraryHealth", () => {
  it("combines bounded metadata, scan, session, slicer, and monitoring issues", () => {
    const health = buildLibraryHealthSnapshot({
      rootPath: "C:\\Models",
      checkedAt: "2026-09-16T12:00:00.000Z",
      scanResult: {
        rootPath: "C:\\Models",
        models: [],
        folders: [],
        errors: [{ path: "C:\\Models\\bad.stl", message: "cannot read" }]
      },
      metadata: {
        models: {
          "C:\\Models\\missing.stl": { favorite: true, tags: [], notes: "" }
        },
        tagCatalog: [],
        slicerHistory: []
      },
      metadataStatus: { availability: "ready", writable: true, source: "primary", message: null },
      sessionIssues: [
        { kind: "thumbnail", modelPath: "C:\\Models\\thumb.stl", detail: "render failed" },
        { kind: "archive", modelPath: "C:\\Models\\pack.zip", detail: "archive failed" }
      ],
      monitoringError: "watcher stopped",
      unavailableSlicerIds: ["cura"]
    });

    expect(health.checkedAt).toBe("2026-09-16T12:00:00.000Z");
    expect(health.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "metadata-file-missing",
      "scan-error",
      "thumbnail-failed",
      "archive-read-failed",
      "slicer-unavailable",
      "monitoring-failed"
    ]));
    expect(health.issues.find((issue) => issue.code === "metadata-file-missing")?.relativePath)
      .toBe("missing.stl");
    expect(health.counts.error).toBeGreaterThan(0);
  });

  it("caps snapshots at 250 issues and detail text at 500 characters", () => {
    const health = buildLibraryHealthSnapshot({
      rootPath: "C:\\Models",
      checkedAt: null,
      scanResult: {
        rootPath: "C:\\Models",
        models: [],
        folders: [],
        errors: Array.from({ length: 300 }, (_, index) => ({
          path: `C:\\Models\\${index}.stl`,
          message: "x".repeat(800)
        }))
      },
      metadata: { models: {}, tagCatalog: [], slicerHistory: [] },
      metadataStatus: { availability: "ready", writable: true, source: "primary", message: null },
      sessionIssues: [],
      monitoringError: null,
      unavailableSlicerIds: []
    });
    expect(health.issues).toHaveLength(250);
    expect(health.issues[0].detail).toHaveLength(500);
  });
});
