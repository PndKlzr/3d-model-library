import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  runThumbnailBenchmark,
  type ThumbnailBenchmarkRequest
} from "../../src/lib/thumbnailBenchmark";
import type { ThumbnailDiagnosticsSnapshot, ThumbnailPriority } from "../../src/lib/thumbnailDiagnostics";
import type { ModelFile } from "../../src/shared/types";

const require = createRequire(import.meta.url);
const { parseArguments } = require("../../scripts/thumbnail-benchmark.cjs") as {
  parseArguments: (args: string[]) => { library: string; scenario: string };
};

describe("thumbnail benchmark command", () => {
  it("rejects a missing or relative benchmark library path", () => {
    expect(() => parseArguments(["--scenario", "warm"])).toThrow("--library is required");
    expect(() => parseArguments(["--library", "models", "--scenario", "warm"]))
      .toThrow("--library must be absolute");
  });

  it("accepts only cold, warm, and scroll scenarios", () => {
    const library = path.resolve("synthetic-library");

    expect(() => parseArguments(["--library", library])).toThrow("--scenario is required");
    expect(() => parseArguments(["--library", library, "--scenario", "fast"]))
      .toThrow("--scenario must be one of: cold, warm, scroll");
    expect(parseArguments(["--library", library, "--scenario", "cold"]))
      .toEqual({ library, scenario: "cold" });
  });
});

describe("thumbnail benchmark runner", () => {
  it("starts measurement before issuing thumbnail requests", async () => {
    const events: string[] = [];

    await runThumbnailBenchmark({
      scenario: "cold",
      models: [model()],
      request: () => {
        events.push("request");
        return resolvedRequest();
      },
      now: () => {
        events.push("clock");
        return 0;
      },
      diagnostics: diagnosticsSnapshot
    });

    expect(events.slice(0, 2)).toEqual(["clock", "request"]);
  });

  it("creates a sanitized aggregate report and skips archive models", async () => {
    const requested: string[] = [];
    const privateModel = model({
      absolutePath: "C:\\Private\\secret-name.stl",
      name: "secret-name.stl",
      sizeBytes: 500
    });

    const report = await runThumbnailBenchmark({
      scenario: "cold",
      models: [privateModel, model({ extension: ".zip", name: "private.zip" })],
      request: (entry) => {
        requested.push(entry.absolutePath);
        return resolvedRequest();
      },
      now: sequenceClock([0, 20, 35, 80]),
      generatedAt: () => "2026-09-10T12:00:00.000Z",
      runtime: { appVersion: "0.1.0", electronVersion: "33.2.1", chromiumVersion: "130" },
      diagnostics: diagnosticsSnapshot
    });

    const text = JSON.stringify(report);
    expect(text).not.toContain("Private");
    expect(text).not.toContain("secret-name");
    expect(text).not.toContain("absolutePath");
    expect(requested).toEqual([privateModel.absolutePath]);
    expect(report).toMatchObject({
      schemaVersion: 1,
      scenario: "cold",
      generatedAt: "2026-09-10T12:00:00.000Z",
      runtime: { appVersion: "0.1.0", electronVersion: "33.2.1", chromiumVersion: "130" },
      modelCount: 1,
      sizeBuckets: { under1MiB: 1, oneToTenMiB: 0, overTenMiB: 0 }
    });
  });

  it("populates the isolated cache before measuring the warm pass", async () => {
    const request = vi.fn(() => resolvedRequest());
    const resetDiagnostics = vi.fn();

    const report = await runThumbnailBenchmark({
      scenario: "warm",
      models: [model(), model({ absolutePath: "C:\\Synthetic\\two.3mf", extension: ".3mf" })],
      request,
      resetDiagnostics,
      now: sequenceClock([0, 5, 10, 15, 20, 25, 30, 35]),
      generatedAt: () => "2026-09-10T12:00:00.000Z",
      diagnostics: () => diagnosticsSnapshot({ cacheHits: resetDiagnostics.mock.calls.length * 2 })
    });

    expect(request).toHaveBeenCalledTimes(4);
    expect(resetDiagnostics).toHaveBeenCalledTimes(1);
    expect(report.thumbnail.cacheHits).toBe(2);
  });

  it("rotates selected, visible, and nearby priorities during scroll stress", async () => {
    const priorities = new Map<string, ThumbnailPriority[]>();
    const models = Array.from({ length: 40 }, (_, index) => model({
      absolutePath: `C:\\Synthetic\\model-${index}.stl`,
      name: `model-${index}.stl`
    }));

    const report = await runThumbnailBenchmark({
      scenario: "scroll",
      models,
      request: (entry, priority) => trackingRequest(entry.id, priority, priorities),
      now: () => 10,
      generatedAt: () => "2026-09-10T12:00:00.000Z",
      diagnostics: diagnosticsSnapshot
    });

    expect(report.modelCount).toBe(40);
    expect([...priorities.values()].some((values) => values.includes("selected"))).toBe(true);
    expect([...priorities.values()].some((values) => values.includes("visible"))).toBe(true);
    expect([...priorities.values()].some((values) => values.includes("nearby"))).toBe(true);
    expect([...priorities.values()].every((values) => values[0] === "historical")).toBe(true);
  });
});

function model(overrides: Partial<ModelFile> = {}): ModelFile {
  return {
    id: overrides.absolutePath ?? "C:\\Synthetic\\model.stl",
    name: "model.stl",
    extension: ".stl",
    absolutePath: "C:\\Synthetic\\model.stl",
    relativeFolder: "",
    sizeBytes: 100,
    modifiedAt: "2026-09-10T00:00:00.000Z",
    dimensionsMm: null,
    objectCount: null,
    previewError: null,
    ...overrides
  };
}

function resolvedRequest(): ThumbnailBenchmarkRequest {
  return { promise: Promise.resolve(null), setPriority() {}, release() {} };
}

function trackingRequest(
  id: string,
  priority: ThumbnailPriority,
  priorities: Map<string, ThumbnailPriority[]>
): ThumbnailBenchmarkRequest {
  const values = [priority];
  priorities.set(id, values);
  return {
    promise: Promise.resolve(null),
    setPriority(nextPriority) { values.push(nextPriority); },
    release() {}
  };
}

function sequenceClock(values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function diagnosticsSnapshot(
  overrides: Partial<ThumbnailDiagnosticsSnapshot> = {}
): ThumbnailDiagnosticsSnapshot {
  return {
    queued: { selected: 0, visible: 0, nearby: 0, mosaic: 0, historical: 0, total: 0 },
    queuedByStage: { io: 0, render: 0, total: 0 },
    running: { io: 0, render: 0, total: 0 },
    cacheHits: 0,
    cacheMisses: 0,
    embeddedHits: 0,
    renders: 0,
    failures: 0,
    discardedHistorical: 0,
    longTasks: { count: 0, maximumMs: 0 },
    retainedResults: { current: 0, peak: 0 },
    durationMs: {
      io: { count: 0, average: 0, maximum: 0 },
      render: { count: 0, average: 0, maximum: 0 },
      total: { count: 0, average: 0, maximum: 0 }
    },
    ...overrides
  };
}
