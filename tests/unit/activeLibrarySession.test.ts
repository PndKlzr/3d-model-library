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

    const switching = harness.session.activate(harness.secondRoot, false);
    await flushMicrotasks();
    expect(harness.session.current()).toBeNull();
    deferred.resolve(scanResult(harness.firstRoot));

    await expect(pending).rejects.toThrow(/stale session/i);
    await switching;
    expect(harness.saves).toEqual([]);
  });

  it("does not publish a rebuild after the active library changes", async () => {
    const scanStarted = createDeferred<void>();
    const scanReady = createDeferred<LibraryScanResult>();
    const harness = createHarness({
      scan: async () => {
        scanStarted.resolve();
        return scanReady.promise;
      }
    });
    const first = await harness.session.activate(harness.firstRoot, false);

    const rebuilding = harness.session.rebuildIndex(first!.session);
    await scanStarted.promise;
    const activation = harness.session.activate(harness.secondRoot, false);
    await flushMicrotasks();
    expect(harness.session.current()).toBeNull();
    scanReady.resolve(scanResult(harness.firstRoot));

    await expect(rebuilding).rejects.toThrow(/stale session/i);
    await activation;
    expect(harness.saves).toEqual([]);
    expect(harness.invalidations).toEqual([`${harness.firstRoot}:id-first`]);
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

    const switching = harness.session.activate(harness.secondRoot, true);
    await flushMicrotasks();
    expect(harness.session.current()).toBeNull();
    applicationResult.resolve(scanResult(harness.firstRoot));
    await pendingBatch;
    await switching;

    expect(harness.saves).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("serializes a watcher batch behind an overlapping full scan", async () => {
    const scanStarted = createDeferred<void>();
    const scanResultReady = createDeferred<LibraryScanResult>();
    const applyEvents = vi.fn(async (current: LibraryScanResult) => ({
      ...structuredClone(current),
      folders: [...current.folders, "watcher"]
    }));
    const harness = createHarness({
      scan: async () => {
        scanStarted.resolve();
        return scanResultReady.promise;
      },
      applyEvents
    });
    const activation = await harness.session.activate(harness.firstRoot, true);
    const pendingScan = harness.session.scan(activation!.session);
    await scanStarted.promise;

    const pendingBatch = Promise.resolve(harness.watchers[0].onBatch([
      { type: "addDir", absolutePath: path.join(harness.firstRoot, "watcher") }
    ]));
    await Promise.resolve();

    expect(applyEvents).not.toHaveBeenCalled();
    scanResultReady.resolve({ ...scanResult(harness.firstRoot), folders: ["scan"] });
    await Promise.all([pendingScan, pendingBatch]);

    expect(harness.savedResults.map((result) => result.folders)).toEqual([
      ["scan"],
      ["scan", "watcher"]
    ]);
  });

  it("serializes a full scan behind an overlapping watcher batch", async () => {
    const applyStarted = createDeferred<void>();
    const applyResultReady = createDeferred<LibraryScanResult>();
    const scanRoot = vi.fn(async (rootPath: string) => ({
      ...scanResult(rootPath),
      folders: ["scan"]
    }));
    const harness = createHarness({
      scan: scanRoot,
      applyEvents: async () => {
        applyStarted.resolve();
        return applyResultReady.promise;
      }
    });
    const activation = await harness.session.activate(harness.firstRoot, true);
    const pendingBatch = Promise.resolve(harness.watchers[0].onBatch([
      { type: "addDir", absolutePath: path.join(harness.firstRoot, "watcher") }
    ]));
    await applyStarted.promise;

    const pendingScan = harness.session.scan(activation!.session);
    await Promise.resolve();

    expect(scanRoot).not.toHaveBeenCalled();
    applyResultReady.resolve({ ...scanResult(harness.firstRoot), folders: ["watcher"] });
    await Promise.all([pendingBatch, pendingScan]);

    expect(harness.savedResults.map((result) => result.folders)).toEqual([
      ["watcher"],
      ["scan"]
    ]);
  });

  it("drains an old A save before failed B activation restores and mutates A", async () => {
    const oldSaveStarted = createDeferred<void>();
    const oldSaveReady = createDeferred<void>();
    let scanCount = 0;
    const harness = createHarness({
      failWatcherRoot: "second",
      scan: async (rootPath) => ({
        ...scanResult(rootPath),
        folders: [scanCount++ === 0 ? "old" : "new"]
      }),
      beforeSave: async (_rootPath, _result, saveNumber) => {
        if (saveNumber !== 1) return;
        oldSaveStarted.resolve();
        await oldSaveReady.promise;
      }
    });
    const first = await harness.session.activate(harness.firstRoot, true);
    const oldScan = harness.session.scan(first!.session);
    await oldSaveStarted.promise;

    const failedActivation = harness.session.activate(harness.secondRoot, true);
    await flushMicrotasks();

    expect(harness.order).not.toContain("metadata:second");
    oldSaveReady.resolve();
    await expect(oldScan).rejects.toThrow(/stale session/i);
    await expect(failedActivation).rejects.toThrow("cannot create watcher");

    const restored = harness.session.current();
    await harness.session.scan(restored!);
    expect(harness.savedResults.map((result) => result.folders)).toEqual([["old"], ["new"]]);
    expect(harness.catalogFor(harness.firstRoot)?.folders).toEqual(["new"]);
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

  it.each([
    ["metadata open", { failMetadataRoot: "second" }],
    ["index load", { failIndexRoot: "second" }],
    ["watcher construction", { failWatcherRoot: "second" }]
  ] as const)("restores A after B fails during %s", async (_label, failure) => {
    const harness = createHarness(failure);
    const first = await harness.session.activate(harness.firstRoot, true);

    await expect(harness.session.activate(harness.secondRoot, true)).rejects.toThrow(
      /cannot (open metadata|load index|create watcher)/
    );

    const restored = harness.session.current();
    expect(restored).toEqual({
      generation: 3,
      rootPath: harness.firstRoot,
      libraryId: "id-first"
    });
    expect(restored?.generation).toBeGreaterThan(first!.session.generation);
    expect(harness.watchers[0].close).toHaveBeenCalledOnce();
    expect(harness.watchers.at(-1)?.rootPath).toBe(harness.firstRoot);
    expect(harness.order.at(-2)).toBe("load:first:id-first");
    expect(harness.order.at(-1)).toBe("watch:first");
  });

  it("does not expose failed B while A restoration is pending", async () => {
    const restorationStarted = createDeferred<void>();
    const restorationReady = createDeferred<void>();
    const harness = createHarness({
      failWatcherRoot: "second",
      onRestoringMetadata: async () => {
        restorationStarted.resolve();
        await restorationReady.promise;
      }
    });
    await harness.session.activate(harness.firstRoot, true);

    const activation = harness.session.activate(harness.secondRoot, true);
    await restorationStarted.promise;

    expect(harness.session.current()).toBeNull();
    restorationReady.resolve();
    await expect(activation).rejects.toThrow("cannot create watcher");
    expect(harness.session.current()?.rootPath).toBe(harness.firstRoot);
  });

  it("returns restored A state after failed B without starting another activation", async () => {
    const harness = createHarness({ failWatcherRoot: "second" });
    await harness.session.activate(harness.firstRoot, true);
    await expect(harness.session.activate(harness.secondRoot, true)).rejects.toThrow(
      "cannot create watcher"
    );
    const watcherCount = harness.watchers.length;
    const closeCount = harness.watchers.reduce(
      (total, watcher) => total + watcher.close.mock.calls.length,
      0
    );

    const restored = await harness.session.currentState();

    expect(restored).toMatchObject({
      session: { generation: 3, rootPath: harness.firstRoot, libraryId: "id-first" },
      cachedResult: { rootPath: harness.firstRoot },
      metadata: { tagCatalog: ["first"] },
      metadataStatus: readyStatus
    });
    expect(harness.watchers).toHaveLength(watcherCount);
    expect(harness.watchers.reduce(
      (total, watcher) => total + watcher.close.mock.calls.length,
      0
    )).toBe(closeCount);
  });

  it("keeps thumbnail publication atomic with a later activation", async () => {
    const publicationStarted = createDeferred<void>();
    const publicationReady = createDeferred<void>();
    const harness = createHarness();
    const first = await harness.session.activate(harness.firstRoot, false);

    const publication = harness.session.publishIfCurrent(first!.session, async () => {
      publicationStarted.resolve();
      await publicationReady.promise;
    });
    await publicationStarted.promise;
    const activation = harness.session.activate(harness.secondRoot, false);
    await flushMicrotasks();

    expect(harness.session.current()).toEqual(first!.session);
    publicationReady.resolve();
    await expect(publication).resolves.toBe(true);
    await activation;
    expect(harness.session.current()?.rootPath).toBe(harness.secondRoot);
  });

  it("withholds thumbnail publication queued behind session invalidation", async () => {
    const canonicalizationStarted = createDeferred<void>();
    const canonicalizationReady = createDeferred<void>();
    const publish = vi.fn(async () => undefined);
    let secondRoot = "";
    const harness = createHarness({
      beforeCanonicalize: async (rootPath) => {
        if (rootPath !== secondRoot) return;
        canonicalizationStarted.resolve();
        await canonicalizationReady.promise;
      }
    });
    secondRoot = harness.secondRoot;
    const first = await harness.session.activate(harness.firstRoot, false);
    const activation = harness.session.activate(harness.secondRoot, false);
    await canonicalizationStarted.promise;
    const publication = harness.session.publishIfCurrent(first!.session, publish);

    canonicalizationReady.resolve();
    await activation;
    await expect(publication).resolves.toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("leaves no active session when B and restored A watcher construction both fail", async () => {
    const harness = createHarness({
      failWatcher: (label, attempt) => label === "second" || (label === "first" && attempt === 2)
    });
    await harness.session.activate(harness.firstRoot, true);

    await expect(harness.session.activate(harness.secondRoot, true)).rejects.toThrow(
      "Library activation failed and the prior session could not be restored"
    );

    expect(harness.session.current()).toBeNull();
    expect(harness.watchers[0].close).toHaveBeenCalledOnce();
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
  failMetadataRoot?: string;
  failIndexRoot?: string;
  failWatcherRoot?: string;
  failWatcher?: (label: string, attempt: number) => boolean;
  beforeCanonicalize?: (rootPath: string) => Promise<void>;
  onRestoringMetadata?: () => Promise<void>;
  beforeSave?: (
    rootPath: string,
    result: LibraryScanResult,
    saveNumber: number
  ) => Promise<void>;
};

function createHarness(options: HarnessOptions = {}) {
  const firstRoot = path.join(tmpdir(), "library-session-first");
  const secondRoot = path.join(tmpdir(), "library-session-second");
  const order: string[] = [];
  const saves: string[] = [];
  const savedResults: LibraryScanResult[] = [];
  const invalidations: string[] = [];
  const catalogs = new Map<string, LibraryScanResult>();
  const watcherAttempts = new Map<string, number>();
  const watchers: Array<{
    rootPath: string;
    onBatch: (events: LibraryWatchEvent[]) => void | Promise<void>;
    onError: (error: unknown) => void;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  let metadataRoot: string | null = null;
  let firstMetadataOpenCount = 0;
  let metadata: LibraryMetadata = { models: {}, tagCatalog: [], slicerHistory: [] };
  const metadataStore = {
    async open(rootPath: string | null) {
      metadataRoot = rootPath;
      const label = rootPath ? path.basename(rootPath).replace("library-session-", "") : "none";
      if (label === "first") firstMetadataOpenCount += 1;
      metadata = { models: {}, tagCatalog: rootPath ? [label] : [], slicerHistory: [] };
      order.push(`metadata:${label}`);
      if (options.failMetadataRoot === label) {
        throw new Error("cannot open metadata");
      }
      if (label === "first" && firstMetadataOpenCount > 1) {
        await options.onRestoringMetadata?.();
      }
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
      if (options.failIndexRoot === label) {
        throw new Error("cannot load index");
      }
      return structuredClone(catalogs.get(rootPath) ?? scanResult(rootPath));
    },
    async save(rootPath: string, libraryId: string, result: LibraryScanResult) {
      saves.push(`${rootPath}:${libraryId}`);
      await options.beforeSave?.(rootPath, result, saves.length);
      savedResults.push(structuredClone(result));
      catalogs.set(rootPath, structuredClone(result));
    },
    async invalidate(rootPath: string, libraryId: string) {
      invalidations.push(`${rootPath}:${libraryId}`);
      catalogs.delete(rootPath);
    }
  };
  const createWatcher: ActiveLibrarySessionOptions["createWatcher"] = ({
    rootPath,
    onBatch,
    onError = () => undefined
  }) => {
    const label = path.basename(rootPath).replace("library-session-", "");
    const attempt = (watcherAttempts.get(label) ?? 0) + 1;
    watcherAttempts.set(label, attempt);
    if (options.failWatcherRoot === label || options.failWatcher?.(label, attempt)) {
      throw new Error("cannot create watcher");
    }
    order.push(`watch:${label}`);
    const close = vi.fn(async () => {
      order.push(`close:${label}`);
    });
    watchers.push({ rootPath, onBatch, onError, close });
    return { close };
  };
  const session = createActiveLibrarySession({
    canonicalizeRoot: async (rootPath) => {
      await options.beforeCanonicalize?.(rootPath);
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

  return {
    session,
    firstRoot,
    secondRoot,
    order,
    saves,
    savedResults,
    invalidations,
    watchers,
    catalogFor: (rootPath: string) => catalogs.get(rootPath)
  };
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

async function flushMicrotasks() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await Promise.resolve();
  }
}
