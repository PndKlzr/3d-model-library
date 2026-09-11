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
  currentState(): Promise<LibraryActivationResult | null>;
  publishIfCurrent(expected: LibrarySessionRef, publish: () => Promise<void>): Promise<boolean>;
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
  let catalogMutationTail: Promise<void> | null = null;

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

  function setActive(session: LibrarySessionRef | null) {
    active = session;
    catalogMutationTail = session ? Promise.resolve() : null;
  }

  function invalidateActive(): Promise<void> {
    const previousCatalogMutationTail = catalogMutationTail ?? Promise.resolve();
    active = null;
    catalogMutationTail = null;
    return previousCatalogMutationTail;
  }

  function enqueueCatalogMutation<T>(operation: () => Promise<T>): Promise<T> {
    const tail = catalogMutationTail;
    if (!tail) return Promise.reject(new Error("Stale session"));
    const result = tail.then(operation);
    catalogMutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function closeWatcher() {
    const currentWatcher = watcher;
    watcher = null;
    await currentWatcher?.close();
  }

  function buildWatcher(session: LibrarySessionRef): LibraryWatcherHandle {
    const captured = cloneSession(session);
    let nextWatcher: LibraryWatcherHandle | null = null;
    const createdWatcher = createWatcher({
      rootPath: captured.rootPath,
      onBatch: async (events) => {
        if (!isCurrent(captured)) return;
        await enqueueCatalogMutation(async () => {
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
        });
      },
      onError: (error) => {
        if (!nextWatcher || !isCurrent(captured) || watcher !== nextWatcher) return;
        watcher = null;
        void nextWatcher.close();
        onMonitoringError({
          session: cloneSession(captured),
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    nextWatcher = createdWatcher;
    return createdWatcher;
  }

  function startWatcher(session: LibrarySessionRef) {
    watcher = buildWatcher(session);
  }

  return {
    activate(rootPath, monitoring) {
      return enqueueTransition(async () => {
        if (rootPath === null) {
          generation += 1;
          const previousCatalogBarrier = invalidateActive();
          await closeWatcher();
          await previousCatalogBarrier;
          await metadataStore.open(null);
          return null;
        }

        const canonicalRoot = await canonicalizeRoot(rootPath);
        const previous = active ? cloneSession(active) : null;
        const previousMonitoring = watcher !== null;
        generation += 1;
        const previousCatalogBarrier = invalidateActive();
        try {
          await closeWatcher();
          await previousCatalogBarrier;
          await metadataStore.open(canonicalRoot);
          const libraryId = metadataStore.getLibraryId();
          if (!libraryId) throw new Error("Library identity is not available");
          const session = { generation, rootPath: canonicalRoot, libraryId };
          const cachedResult = await indexStore.load(canonicalRoot, libraryId);
          const nextWatcher = monitoring ? buildWatcher(session) : null;
          setActive(session);
          watcher = nextWatcher;

          return structuredClone({
            session,
            cachedResult,
            metadata: metadataStore.getMetadata(),
            metadataStatus: metadataStore.getStatus()
          });
        } catch (activationError) {
          try {
            const failedCatalogBarrier = invalidateActive();
            await closeWatcher();
            await previousCatalogBarrier;
            await failedCatalogBarrier;
            generation += 1;

            if (!previous) {
              await metadataStore.open(null);
            } else {
              await metadataStore.open(previous.rootPath);
              const libraryId = metadataStore.getLibraryId();
              if (!libraryId) throw new Error("Prior library identity is not available");
              await indexStore.load(previous.rootPath, libraryId);
              const restored = { generation, rootPath: previous.rootPath, libraryId };
              const restoredWatcher = previousMonitoring ? buildWatcher(restored) : null;
              setActive(restored);
              watcher = restoredWatcher;
            }
          } catch (restoreError) {
            invalidateActive();
            await closeWatcher();
            throw new AggregateError(
              [activationError, restoreError],
              "Library activation failed and the prior session could not be restored"
            );
          }

          throw activationError;
        }
      });
    },

    async currentState() {
      const expected = active ? cloneSession(active) : null;
      if (!expected) return null;

      return enqueueCatalogMutation(async () => {
        assertCurrent(expected);
        const cachedResult = await indexStore.load(expected.rootPath, expected.libraryId);
        assertCurrent(expected);
        return structuredClone({
          session: expected,
          cachedResult,
          metadata: metadataStore.getMetadata(),
          metadataStatus: metadataStore.getStatus()
        });
      });
    },

    publishIfCurrent(expected, publish) {
      return enqueueTransition(async () => {
        if (!isCurrent(expected)) return false;
        await publish();
        return true;
      });
    },

    async scan(expected) {
      assertCurrent(expected);
      return enqueueCatalogMutation(async () => {
        assertCurrent(expected);
        const result = await scanRoot(expected.rootPath);
        assertCurrent(expected);
        await indexStore.save(expected.rootPath, expected.libraryId, result);
        assertCurrent(expected);
        return structuredClone({ session: expected, result });
      });
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
        const previousCatalogBarrier = invalidateActive();
        await closeWatcher();
        await previousCatalogBarrier;
        await metadataStore.open(null);
      });
    }
  };
}

function normalizeRoot(rootPath: string): string {
  return path.resolve(rootPath).replaceAll("\\", "/").toLowerCase();
}

function cloneSession(session: LibrarySessionRef): LibrarySessionRef {
  return { ...session };
}
