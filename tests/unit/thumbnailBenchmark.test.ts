import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  runThumbnailBenchmark,
  type ThumbnailBenchmarkRequest
} from "../../src/lib/thumbnailBenchmark";
import type { ThumbnailDiagnosticsSnapshot, ThumbnailPriority } from "../../src/lib/thumbnailDiagnostics";
import type { ModelFile } from "../../src/shared/types";

const require = createRequire(import.meta.url);
const { DEFAULT_TIMEOUT_MS, parseArguments, run, spawnElectron } = require("../../scripts/thumbnail-benchmark.cjs") as {
  DEFAULT_TIMEOUT_MS: number;
  parseArguments: (args: string[]) => { library: string; scenario: string };
  run: (args: string[], dependencies: Record<string, unknown>) => Promise<void>;
  spawnElectron: (options: Record<string, string>, dependencies: Record<string, unknown>) => Promise<void>;
};

describe("thumbnail benchmark command", () => {
  it("allows enough time for large real-world libraries", () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(15 * 60_000);
  });

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

  it("rejects canonical output paths inside the library before any write", async () => {
    const mkdir = vi.fn();
    const mkdtemp = vi.fn();

    await expect(run(["--library", "C:\\alias", "--scenario", "cold"], {
      cwd: "C:\\project",
      tmpdir: "C:\\temp",
      realpath: async (value: string) => value === "C:\\alias"
        ? "C:\\canonical"
        : value === "C:\\project"
          ? "C:\\canonical\\project"
          : value,
      stat: async () => ({ isDirectory: () => true }),
      mkdir,
      mkdtemp
    })).rejects.toThrow("benchmark output must be outside the library");
    expect(mkdir).not.toHaveBeenCalled();
    expect(mkdtemp).not.toHaveBeenCalled();
  });

  it("cleans temporary user data when output setup fails", async () => {
    const rm = vi.fn(async () => undefined);

    await expect(run(["--library", "C:\\library", "--scenario", "cold"], {
      cwd: "C:\\project",
      tmpdir: "C:\\temp",
      realpath: async (value: string) => value,
      stat: async () => ({ isDirectory: () => true }),
      mkdtemp: async () => "C:\\temp\\profile",
      mkdir: async () => { throw new Error("denied"); },
      rm
    })).rejects.toThrow("denied");
    expect(rm).toHaveBeenCalledWith("C:\\temp\\profile", { recursive: true, force: true });
  });

  it("kills an unresponsive Electron child when the watchdog expires", async () => {
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    child.kill = vi.fn();

    await expect(spawnElectron({
      library: "C:\\library",
      scenario: "cold",
      output: "C:\\output.json",
      userData: "C:\\temp\\profile"
    }, {
      spawn: () => child,
      timeoutMs: 1
    })).rejects.toThrow("timed out");
    expect(child.kill).toHaveBeenCalled();
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
      libraryScanReadyMs: 42,
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
    expect(report.timingsMs.libraryScanReady).toBe(42);
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

  it("processes every model in bounded batches on both warm passes", async () => {
    const models = Array.from({ length: 80 }, (_, index) => model({
      id: `model-${index}`,
      absolutePath: `C:\\Synthetic\\model-${index}.stl`
    }));
    let active = 0;
    let peak = 0;
    let measured = false;
    let cacheHits = 0;
    let renders = 0;
    const cache = new Set<string>();
    const calls = new Map<string, number>();

    const report = await runThumbnailBenchmark({
      scenario: "warm",
      models,
      request: (entry) => {
        active += 1;
        peak = Math.max(peak, active);
        calls.set(entry.id, (calls.get(entry.id) ?? 0) + 1);
        if (cache.has(entry.id)) {
          if (measured) cacheHits += 1;
        } else {
          cache.add(entry.id);
          if (measured) renders += 1;
        }
        return {
          promise: Promise.resolve("data:image/webp;base64,test").finally(() => { active -= 1; }),
          setPriority() {},
          release() {}
        };
      },
      resetDiagnostics: () => { measured = true; cacheHits = 0; renders = 0; },
      now: () => 0,
      diagnostics: () => diagnosticsSnapshot({ cacheHits, renders })
    });

    expect(peak).toBeLessThanOrEqual(24);
    expect(calls.size).toBe(80);
    expect([...calls.values()].every((count) => count === 2)).toBe(true);
    expect(report.thumbnail).toMatchObject({ cacheHits: 80, renders: 0 });
  });

  it("times the first successful non-null visible thumbnail", async () => {
    let time = 0;

    const report = await runThumbnailBenchmark({
      scenario: "cold",
      models: [model({ id: "null" }), model({ id: "image" })],
      request: (entry) => ({
        promise: entry.id === "null"
          ? Promise.resolve().then(() => { time = 5; return null; })
          : Promise.resolve().then(() => Promise.resolve()).then(() => {
              time = 25;
              return "data:image/webp;base64,test";
            }),
        setPriority() {},
        release() {}
      }),
      now: () => time,
      diagnostics: diagnosticsSnapshot
    });

    expect(report.timingsMs.firstVisibleThumbnail).toBe(25);
  });

  it("does not count a nearby thumbnail as the first visible thumbnail", async () => {
    let time = 0;
    let nearbyCompleted = false;
    const visible = deferred<string | null>();
    const models = Array.from({ length: 25 }, (_, index) => model({
      id: `model-${index}`,
      absolutePath: `C:\\Synthetic\\model-${index}.stl`
    }));

    const running = runThumbnailBenchmark({
      scenario: "scroll",
      models,
      request: (_entry, priority) => ({
        promise: Promise.resolve().then(() => {
          if (priority === "nearby") {
            time = 5;
            nearbyCompleted = true;
            return "nearby-image";
          }
          return visible.promise;
        }),
        setPriority() {},
        release() {}
      }),
      waitForFrame: async () => undefined,
      now: () => time,
      diagnostics: diagnosticsSnapshot
    });

    await vi.waitFor(() => expect(nearbyCompleted).toBe(true));
    time = 25;
    visible.resolve("visible-image");

    expect((await running).timingsMs.firstVisibleThumbnail).toBe(25);
  });

  it("paces scroll windows down and back by frames and completed work", async () => {
    const visits: string[] = [];
    const events: string[] = [];
    const models = Array.from({ length: 40 }, (_, index) => model({
      id: `model-${index}`,
      absolutePath: `C:\\Synthetic\\model-${index}.stl`,
      name: `model-${index}.stl`
    }));

    const report = await runThumbnailBenchmark({
      scenario: "scroll",
      models,
      request: (entry, priority) => {
        if (priority === "selected") visits.push(entry.id);
        return {
          promise: Promise.resolve().then(() => {
            events.push(`complete:${entry.id}`);
            return "data:image/webp;base64,test";
          }),
          setPriority() {},
          release() {}
        };
      },
      waitForFrame: async () => { events.push("frame"); },
      now: () => 10,
      generatedAt: () => "2026-09-10T12:00:00.000Z",
      diagnostics: diagnosticsSnapshot
    });

    expect(report.modelCount).toBe(40);
    expect(visits).toEqual(["model-0", "model-12", "model-16", "model-12", "model-0"]);
    expect(events.filter((event) => event === "frame")).toHaveLength(visits.length);
    expect(events.findIndex((event) => event.startsWith("complete:")))
      .toBeLessThan(events.lastIndexOf("frame"));
  });

  it("does not include nearby work in initially visible settlement timing", async () => {
    const nearby = deferred<string | null>();
    let time = 0;
    let nearbyRequested = false;
    const models = Array.from({ length: 30 }, (_, index) => model({
      id: `model-${index}`,
      absolutePath: `C:\\Synthetic\\model-${index}.stl`
    }));

    const running = runThumbnailBenchmark({
      scenario: "scroll",
      models,
      request: (_entry, priority) => {
        if (priority === "nearby") nearbyRequested = true;
        return {
          promise: priority === "nearby" ? nearby.promise : Promise.resolve("image"),
          setPriority() {},
          release() {}
        };
      },
      waitForFrame: async () => undefined,
      now: () => time,
      diagnostics: diagnosticsSnapshot
    });

    await vi.waitFor(() => expect(nearbyRequested).toBe(true));
    await Promise.resolve();
    time = 100;
    nearby.resolve("image");

    expect((await running).timingsMs.initiallyVisibleSettled).toBe(0);
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

function sequenceClock(values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
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
