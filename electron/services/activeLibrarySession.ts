import path from "node:path";
import type {
  LibraryActivationResult,
  LibraryScanResult,
  LibrarySessionRef,
  VersionedLibraryMonitoringError,
  VersionedLibraryScanResult,
  VersionedLibraryWatchEvents
} from "../../src/shared/types.js";
import type { ActiveLibraryMetadataStore } from "./activeLibraryMetadataStore.js";
import type { LibraryIndexStore } from "./libraryIndexStore.js";
import { applyLibraryWatchEvents, scanLibrary } from "./libraryScanner.js";
import { createLibraryWatcher, type LibraryWatcherHandle } from "./libraryWatcher.js";

export type ActiveLibrarySession = {
  activate(rootPath: string | null, monitoring: boolean): Promise<LibraryActivationResult | null>;
  scan(expected: LibrarySessionRef): Promise<VersionedLibraryScanResult>;
  setMonitoring(expected: LibrarySessionRef, enabled: boolean): Promise<void>;
  current(): LibrarySessionRef | null;
  close(): Promise<void>;
};

export type ActiveLibrarySessionOptions = {
  canonicalizeRoot: (rootPath: string) => Promise<string>;
  metadataStore: ActiveLibraryMetadataStore;
  indexStore: LibraryIndexStore;
  scanLibrary?: typeof scanLibrary;
  applyWatchEvents?: typeof applyLibraryWatchEvents;
  createWatcher?: typeof createLibraryWatcher;
  onChanged?: (payload: VersionedLibraryWatchEvents) => void;
  onMonitoringError?: (payload: VersionedLibraryMonitoringError) => void;
};

export function createActiveLibrarySession({
  canonicalizeRoot,
  metadataStore,
  indexStore,
  scanLibrary: scanRoot = scanLibrary,
  applyWatchEvents: applyEvents = applyLibraryWatchEvents,
  createWatcher = createLibraryWatcher,
  onChanged = () => undefined,
  onMonitoringError = () => undefined
}: ActiveLibrarySessionOptions): ActiveLibrarySession {
  let generation = 0;
  let active: LibrarySessionRef | null = null;
  let watcher: LibraryWatcherHandle | null = null;
  let transitionTail = Promise.resolve();

  function enqueueTransition<T>(operation: () => Promise<T>): Promise<T> {
    const result = transitionTail.then(operation);
    transitionTail = result.then(() => undefined, () => undefined);
    return result;
  }

  function isCurrent(expected: LibrarySessionRef): boolean {
    return active !== null &&
      active.generation === expected.generation &&
      normalizeRoot(active.rootPath) === normalizeRoot(expected.rootPath) &&
      active.libraryId === expected.libraryId;
  }

  function assertCurrent(expected: LibrarySessionRef) {
    if (!isCurrent(expected)) {
      throw new Error("Stale session");
    }
  }

  async function closeWatcher() {
    const currentWatcher = watcher;
    watcher = null;
    await currentWatcher?.close();
  }

  function startWatcher(session: LibrarySessionRef) {
    const captured = cloneSession(session);
    const nextWatcher = createWatcher({
      rootPath: captured.rootPath,
      onBatch: async (events) => {
        if (!isCurrent(captured)) return;
        const cached = await indexStore.load(captured.rootPath, captured.libraryId);
        if (!isCurrent(captured)) return;
        const current = cached ?? await scanRoot(captured.rootPath);
        if (!isCurrent(captured)) return;
        const result = await applyEvents(current, events);
        if (!isCurrent(captured)) return;
        await indexStore.save(captured.rootPath, captured.libraryId, result);
        if (!isCurrent(captured)) return;
        onChanged(structuredClone({ session: captured, events }));
      },
      onError: (error) => {
        if (!isCurrent(captured) || watcher !== nextWatcher) return;
        watcher = null;
        void nextWatcher.close();
        onMonitoringError({
          session: cloneSession(captured),
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    watcher = nextWatcher;
  }

  return {
    activate(rootPath, monitoring) {
      return enqueueTransition(async () => {
        if (rootPath === null) {
          generation += 1;
          active = null;
          await closeWatcher();
          await metadataStore.open(null);
          return null;
        }

        const canonicalRoot = await canonicalizeRoot(rootPath);
        generation += 1;
        active = null;
        await closeWatcher();
        await metadataStore.open(canonicalRoot);
        const libraryId = metadataStore.getLibraryId();
        if (!libraryId) throw new Error("Library identity is not available");
        const session = { generation, rootPath: canonicalRoot, libraryId };
        const cachedResult = await indexStore.load(canonicalRoot, libraryId);
        active = session;
        if (monitoring) startWatcher(session);

        return structuredClone({
          session,
          cachedResult,
          metadata: metadataStore.getMetadata(),
          metadataStatus: metadataStore.getStatus()
        });
      });
    },

    async scan(expected) {
      assertCurrent(expected);
      const result = await scanRoot(expected.rootPath);
      assertCurrent(expected);
      await indexStore.save(expected.rootPath, expected.libraryId, result);
      assertCurrent(expected);
      return structuredClone({ session: expected, result });
    },

    setMonitoring(expected, enabled) {
      return enqueueTransition(async () => {
        assertCurrent(expected);
        await closeWatcher();
        assertCurrent(expected);
        if (enabled) startWatcher(expected);
      });
    },

    current() {
      return active ? cloneSession(active) : null;
    },

    close() {
      return enqueueTransition(async () => {
        generation += 1;
        active = null;
        await closeWatcher();
        await metadataStore.open(null);
      });
    }
  };
}

export function isAbsolutePathInside(rootPath: string, candidatePath: string): boolean {
  if (!path.isAbsolute(candidatePath)) return false;
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath);
}

function normalizeRoot(rootPath: string): string {
  return path.resolve(rootPath).replaceAll("\\", "/").toLowerCase();
}

function cloneSession(session: LibrarySessionRef): LibrarySessionRef {
  return { ...session };
}
