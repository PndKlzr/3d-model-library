import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import {
  createActiveLibrarySession,
  type ActiveLibrarySessionOptions
} from "../../electron/services/activeLibrarySession";
import type {
  LibraryMetadata,
  LibraryMetadataStatus,
  LibraryScanResult,
  LibrarySessionRef,
  LibraryWatchEvent
} from "../../src/shared/types";

const readyStatus: LibraryMetadataStatus = {
  availability: "ready",
  writable: true,
  source: "primary",
  message: null
};

describe("activeLibrarySession", () => {
  it("switches A to B with matching catalogs and closes the old watcher first", async () => {
    const harness = createHarness();
    const first = await harness.session.activate(harness.firstRoot, true);
    const second = await harness.session.activate(harness.secondRoot, true);

    expect(first?.cachedResult?.rootPath).toBe(harness.firstRoot);
    expect(second?.cachedResult?.rootPath).toBe(harness.secondRoot);
    expect(second?.session).toMatchObject({
      generation: 2,
      rootPath: harness.secondRoot,
      libraryId: "id-second"
    });
    expect(harness.order).toEqual([
      "metadata:first",
      "load:first:id-first",
      "watch:first",
      "close:first",
      "metadata:second",
      "load:second:id-second",
      "watch:second"
    ]);
  });

  it("rejects a pending A scan after B becomes active without saving A", async () => {
    const deferred = createDeferred<LibraryScanResult>();
    const harness = createHarness({ scan: () => deferred.promise });
    const first = await harness.session.activate(harness.firstRoot, false);
    const pending = harness.session.scan(first!.session);

    await harness.session.activate(harness.secondRoot, false);
    deferred.resolve(scanResult(harness.firstRoot));

    await expect(pending).rejects.toThrow(/stale session/i);
    expect(harness.saves).toEqual([]);
  });

  it("ignores a stale watcher batch after switching roots", async () => {
    const applyEvents = vi.fn(async (current: LibraryScanResult) => current);
    const onChanged = vi.fn();
    const harness = createHarness({ applyEvents, onChanged });
    await harness.session.activate(harness.firstRoot, true);
    const staleBatch = harness.watchers[0].onBatch;
    await harness.session.activate(harness.secondRoot, true);

    await staleBatch([{ type: "add", absolutePath: path.join(harness.firstRoot, "late.stl") }]);

    expect(applyEvents).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(harness.saves).toEqual([]);
  });

  it("drops a watcher batch that becomes stale while events are being applied", async () => {
    const applicationStarted = createDeferred<void>();
    const applicationResult = createDeferred<LibraryScanResult>();
    const onChanged = vi.fn();
    const harness = createHarness({
      applyEvents: async () => {
        applicationStarted.resolve();
        return applicationResult.promise;
      },
      onChanged
    });
    await harness.session.activate(harness.firstRoot, true);
    const pendingBatch = Promise.resolve(harness.watchers[0].onBatch([
      { type: "add", absolutePath: path.join(harness.firstRoot, "late.stl") }
    ]));
    await applicationStarted.promise;

    await harness.session.activate(harness.secondRoot, true);
    applicationResult.resolve(scanResult(harness.firstRoot));
    await pendingBatch;

    expect(harness.saves).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("binds metadata and its authoritative ID before activation resolves", async () => {
    const harness = createHarness();

    const activation = await harness.session.activate(harness.firstRoot, false);

    expect(activation).toMatchObject({
      session: { libraryId: "id-first" },
      metadata: { tagCatalog: ["first"] },
      metadataStatus: readyStatus
    });
    expect(harness.order).toEqual(["metadata:first", "load:first:id-first"]);
  });

  it("keeps the prior session when the requested root cannot be canonicalized", async () => {
    const harness = createHarness({ failCanonicalRoot: "broken" });
    const first = await harness.session.activate(harness.firstRoot, true);

    await expect(harness.session.activate(path.join(tmpdir(), "broken"), true)).rejects.toThrow(
      "cannot canonicalize"
    );

    expect(harness.session.current()).toEqual(first!.session);
    expect(harness.watchers[0].close).not.toHaveBeenCalled();
  });

  it("deactivates on null and invalidates the old session", async () => {
    const harness = createHarness();
    const first = await harness.session.activate(harness.firstRoot, true);

    await expect(harness.session.activate(null, false)).resolves.toBeNull();

    expect(harness.session.current()).toBeNull();
    expect(harness.watchers[0].close).toHaveBeenCalledOnce();
    await expect(harness.session.scan(first!.session)).rejects.toThrow(/stale session/i);
    expect(harness.order.at(-1)).toBe("metadata:none");
  });

  it("returns clone-safe activation, current, scan, and watcher payloads", async () => {
    const changed: Array<{ session: LibrarySessionRef; events: LibraryWatchEvent[] }> = [];
    const harness = createHarness({ onChanged: (payload) => changed.push(payload) });
    const activation = await harness.session.activate(harness.firstRoot, true);
    activation!.session.generation = 99;
    activation!.cachedResult!.folders.push("mutated");
    activation!.metadata.tagCatalog.push("mutated");

    const current = harness.session.current()!;
    expect(current.generation).toBe(1);
    expect(current).not.toBe(harness.session.current());
    const scanned = await harness.session.scan(current);
    scanned.session.generation = 88;
    scanned.result.folders.push("mutated");
    expect(harness.session.current()?.generation).toBe(1);

    const events: LibraryWatchEvent[] = [
      { type: "add", absolutePath: path.join(harness.firstRoot, "part.stl") }
    ];
    await harness.watchers[0].onBatch(events);
    events[0].absolutePath = "mutated";
    expect(changed[0].session.generation).toBe(1);
    expect(changed[0].events[0].absolutePath).toBe(path.join(harness.firstRoot, "part.stl"));
  });

  it("rejects monitoring changes from stale sessions and versions monitoring errors", async () => {
    const errors: Array<{ session: LibrarySessionRef; message: string }> = [];
    const harness = createHarness({ onMonitoringError: (payload) => errors.push(payload) });
    const first = await harness.session.activate(harness.firstRoot, true);
    const second = await harness.session.activate(harness.secondRoot, true);

    await expect(harness.session.setMonitoring(first!.session, false)).rejects.toThrow(/stale/i);
    harness.watchers[1].onError(new Error("disk watcher failed"));
    await Promise.resolve();

    expect(errors).toEqual([{
      session: second!.session,
      message: "disk watcher failed"
    }]);
  });
});

type HarnessOptions = {
  scan?: ActiveLibrarySessionOptions["scanLibrary"];
  applyEvents?: ActiveLibrarySessionOptions["applyWatchEvents"];
  onChanged?: ActiveLibrarySessionOptions["onChanged"];
  onMonitoringError?: ActiveLibrarySessionOptions["onMonitoringError"];
  failCanonicalRoot?: string;
};

function createHarness(options: HarnessOptions = {}) {
  const firstRoot = path.join(tmpdir(), "library-session-first");
  const secondRoot = path.join(tmpdir(), "library-session-second");
  const order: string[] = [];
  const saves: string[] = [];
  const watchers: Array<{
    rootPath: string;
    onBatch: (events: LibraryWatchEvent[]) => void | Promise<void>;
    onError: (error: unknown) => void;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  let metadataRoot: string | null = null;
  let metadata: LibraryMetadata = { models: {}, tagCatalog: [], slicerHistory: [] };
  const metadataStore = {
    async open(rootPath: string | null) {
      metadataRoot = rootPath;
      const label = rootPath ? path.basename(rootPath).replace("library-session-", "") : "none";
      metadata = { models: {}, tagCatalog: rootPath ? [label] : [], slicerHistory: [] };
      order.push(`metadata:${label}`);
    },
    retry: async () => undefined,
    getLibraryId: () => metadataRoot ? `id-${path.basename(metadataRoot).replace("library-session-", "")}` : null,
    getMetadata: () => structuredClone(metadata),
    getStatus: () => ({ ...readyStatus }),
    toggleFavorite: async () => metadata,
    setTags: async () => metadata,
    setNotes: async () => metadata,
    addCatalogTag: async () => metadata,
    removeCatalogTag: async () => metadata,
    movePathMetadata: async () => metadata,
    recordSlicerOpen: async () => metadata
  };
  const indexStore = {
    async load(rootPath: string, libraryId?: string) {
      const label = path.basename(rootPath).replace("library-session-", "");
      order.push(`load:${label}:${libraryId}`);
      return scanResult(rootPath);
    },
    async save(rootPath: string, libraryId: string) {
      saves.push(`${rootPath}:${libraryId}`);
    }
  };
  const createWatcher: ActiveLibrarySessionOptions["createWatcher"] = ({
    rootPath,
    onBatch,
    onError = () => undefined
  }) => {
    const label = path.basename(rootPath).replace("library-session-", "");
    order.push(`watch:${label}`);
    const close = vi.fn(async () => {
      order.push(`close:${label}`);
    });
    watchers.push({ rootPath, onBatch, onError, close });
    return { close };
  };
  const session = createActiveLibrarySession({
    canonicalizeRoot: async (rootPath) => {
      if (options.failCanonicalRoot && rootPath.includes(options.failCanonicalRoot)) {
        throw new Error("cannot canonicalize");
      }
      return path.resolve(rootPath);
    },
    metadataStore,
    indexStore,
    scanLibrary: options.scan ?? (async (rootPath) => scanResult(rootPath)),
    applyWatchEvents: options.applyEvents ?? (async (current) => structuredClone(current)),
    createWatcher,
    onChanged: options.onChanged,
    onMonitoringError: options.onMonitoringError
  });

  return { session, firstRoot, secondRoot, order, saves, watchers };
}

function scanResult(rootPath: string): LibraryScanResult {
  return { rootPath, models: [], folders: [], errors: [] };
}

function createDeferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: resolve as T extends void ? () => void : (value: T) => void };
}
