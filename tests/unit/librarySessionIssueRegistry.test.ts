import { describe, expect, it, vi } from "vitest";
import { createLibrarySessionIssueRegistry } from "../../src/lib/librarySessionIssueRegistry";

describe("librarySessionIssueRegistry", () => {
  it("bounds session issues and clears a model after a successful retry", () => {
    const registry = createLibrarySessionIssueRegistry(2);
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.record("thumbnail", "C:\\Models\\a.stl", new Error("A"));
    registry.record("thumbnail", "C:\\Models\\b.stl", new Error("B"));
    registry.record("archive", "C:\\Models\\c.zip", new Error("C"));

    expect(registry.getSnapshot().map((item) => item.modelPath)).toEqual([
      "C:\\Models\\b.stl",
      "C:\\Models\\c.zip"
    ]);
    registry.resolve("archive", "C:\\Models\\c.zip");
    expect(registry.getSnapshot().map((item) => item.modelPath)).toEqual([
      "C:\\Models\\b.stl"
    ]);
    expect(listener).toHaveBeenCalled();
  });

  it("truncates details and resets without retaining another library", () => {
    const registry = createLibrarySessionIssueRegistry();
    registry.record("thumbnail", "C:\\Models\\part.stl", new Error("x".repeat(800)));
    expect(registry.getSnapshot()[0].detail).toHaveLength(500);
    registry.reset();
    expect(registry.getSnapshot()).toEqual([]);
  });

  it("reports the bounded issue fact to diagnostics when a failure is recorded", () => {
    const reportIssue = vi.fn();
    const registry = createLibrarySessionIssueRegistry(250, reportIssue);

    registry.record("thumbnail", "C:\\Models\\part.stl", new Error("render failed"));

    expect(reportIssue).toHaveBeenCalledWith({
      kind: "thumbnail",
      modelPath: "C:\\Models\\part.stl",
      detail: "render failed"
    });
  });
});
