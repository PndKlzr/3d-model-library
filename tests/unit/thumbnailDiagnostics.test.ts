import { describe, expect, it, vi } from "vitest";
import {
  createThumbnailDiagnostics,
  formatThumbnailDiagnosticReport,
  observeThumbnailLongTasks
} from "../../src/lib/thumbnailDiagnostics";

describe("thumbnailDiagnostics", () => {
  it("publishes aggregate stage counts and durations", () => {
    let now = 10;
    const diagnostics = createThumbnailDiagnostics(() => now);
    const snapshots: number[] = [];
    const unsubscribe = diagnostics.subscribe((snapshot) => snapshots.push(snapshot.queued.total));
    const operation = diagnostics.start("io", "visible");
    expect(diagnostics.getSnapshot().queued.visible).toBe(1);
    operation.running();
    now = 34;
    operation.succeeded("cache");
    expect(diagnostics.getSnapshot()).toMatchObject({ cacheHits: 1, failures: 0 });
    expect(diagnostics.getSnapshot().durationMs.io.maximum).toBe(24);
    unsubscribe();
    expect(snapshots.length).toBeGreaterThan(1);
  });

  it("counts result sources, failures, and duration averages", () => {
    let now = 0;
    const diagnostics = createThumbnailDiagnostics(() => now);

    const request = diagnostics.startRequest();

    diagnostics.recordCacheMiss();
    const embedded = diagnostics.start("io", "selected");
    embedded.running();
    now = 10;
    embedded.succeeded("embedded");

    diagnostics.recordCacheMiss();
    const rendered = diagnostics.start("render", "mosaic");
    rendered.running();
    now = 30;
    rendered.succeeded("render");

    const failed = diagnostics.start("render", "historical");
    failed.running();
    now = 40;
    failed.failed();
    request.settled();

    expect(diagnostics.getSnapshot()).toMatchObject({
      queued: { total: 0 },
      running: { total: 0 },
      cacheHits: 0,
      cacheMisses: 2,
      embeddedHits: 1,
      renders: 1,
      failures: 1,
      durationMs: {
        io: { count: 1, average: 10, maximum: 10 },
        render: { count: 2, average: 15, maximum: 20 },
        total: { count: 1, average: 40, maximum: 40 }
      }
    });
  });

  it("publishes immutable snapshots and resets every aggregate", () => {
    const diagnostics = createThumbnailDiagnostics(() => 5);
    const received: ReturnType<typeof diagnostics.getSnapshot>[] = [];
    const unsubscribe = diagnostics.subscribe((snapshot) => received.push(snapshot));
    const operation = diagnostics.start("io", "nearby");
    operation.running();
    operation.succeeded("cache");
    diagnostics.recordLongTask(150);

    const exposed = diagnostics.getSnapshot();
    exposed.cacheHits = 99;
    received.at(-1)!.queued.total = 99;
    expect(diagnostics.getSnapshot()).toMatchObject({ cacheHits: 1, queued: { total: 0 } });

    diagnostics.reset();
    expect(diagnostics.getSnapshot()).toEqual(emptySnapshot());
    expect(received.at(-1)).toEqual(emptySnapshot());

    unsubscribe();
    diagnostics.recordLongTask(200);
    expect(received.at(-1)).toEqual(emptySnapshot());
  });

  it("keeps operation counters non-negative after repeated transitions", () => {
    const diagnostics = createThumbnailDiagnostics(() => 10);
    const operation = diagnostics.start("render", "historical");

    operation.running();
    operation.running();
    operation.succeeded("render");
    operation.failed();

    expect(diagnostics.getSnapshot()).toMatchObject({
      queued: { historical: 0, total: 0 },
      running: { render: 0, total: 0 },
      renders: 1,
      failures: 0
    });
  });

  it("ignores queued operation transitions from before reset", () => {
    const diagnostics = createThumbnailDiagnostics(() => 10);
    const stale = diagnostics.start("io", "visible");
    diagnostics.reset();
    diagnostics.start("io", "visible");

    stale.running();
    stale.succeeded("cache");

    expect(diagnostics.getSnapshot()).toMatchObject({
      queued: { visible: 1, total: 1 },
      running: { io: 0, total: 0 },
      cacheHits: 0,
      durationMs: { io: { count: 0 } }
    });
  });

  it("ignores running operation transitions from before reset", () => {
    const diagnostics = createThumbnailDiagnostics(() => 10);
    const stale = diagnostics.start("render", "selected");
    stale.running();
    diagnostics.reset();
    const current = diagnostics.start("render", "selected");
    current.running();

    stale.succeeded("render");

    expect(diagnostics.getSnapshot()).toMatchObject({
      queued: { total: 0 },
      running: { render: 1, total: 1 },
      cacheMisses: 0,
      renders: 0,
      durationMs: { render: { count: 0 } }
    });
  });

  it("formats a report without identifying model data", () => {
    const diagnostics = createThumbnailDiagnostics(() => 10);
    const snapshot = diagnostics.getSnapshot() as ReturnType<typeof diagnostics.getSnapshot> & {
      absolutePath: string;
      filename: string;
      tags: string[];
      notes: string;
      imageData: string;
      modelBytes: number[];
    };
    Object.assign(snapshot, {
      absolutePath: "C:\\private\\model.stl",
      filename: "model.stl",
      tags: ["private-tag"],
      notes: "private-note",
      imageData: "private-image-data",
      modelBytes: [80, 75, 3, 4]
    });
    const report = formatThumbnailDiagnosticReport(snapshot, {
      appVersion: "0.1.0",
      electronVersion: "33.2.1",
      chromiumVersion: "130"
    });
    expect(report).toContain("cacheHits");
    expect(report).not.toContain("absolutePath");
    expect(report).not.toContain("filename");
    expect(report).not.toContain("private-tag");
    expect(report).not.toContain("private-note");
    expect(report).not.toContain("private-image-data");
    expect(report).not.toContain("modelBytes");
  });

  it("records browser long tasks without retaining entry attribution", () => {
    const diagnostics = createThumbnailDiagnostics(() => 10);
    const disconnect = vi.fn();
    const observer = observeThumbnailLongTasks(diagnostics, fakePerformanceObserver([
      performanceEntry(125, "private-attribution", 0),
      performanceEntry(80, "other-attribution", 125)
    ], disconnect));
    observer.start();
    expect(diagnostics.getSnapshot().longTasks).toEqual({ count: 2, maximumMs: 125 });
    expect(JSON.stringify(diagnostics.getSnapshot())).not.toContain("attribution");
    observer.stop();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

function fakePerformanceObserver(entries: PerformanceEntry[], disconnect = () => undefined) {
  return (callback: PerformanceObserverCallback) => ({
    observe: () => callback({ getEntries: () => entries } as PerformanceObserverEntryList, {} as PerformanceObserver),
    disconnect
  } as PerformanceObserver);
}

function performanceEntry(duration: number, name: string, startTime: number): PerformanceEntry {
  return { duration, name, entryType: "longtask", startTime, toJSON: () => ({}) };
}

function emptySnapshot() {
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
    }
  };
}
