import path from "node:path";
import chokidar from "chokidar";
import type { LibraryWatchEvent } from "../../src/shared/types.js";
import { isPathInside } from "./pathContainment.js";
import { isInternalLibraryPath } from "./portableMetadataCodec.js";

const SUPPORTED_EXTENSIONS = new Set([".stl", ".3mf", ".zip", ".rar", ".7z"]);

export type LibraryWatcherLike = {
  on: (name: string, listener: (...args: unknown[]) => void) => LibraryWatcherLike;
  close: () => Promise<unknown>;
};

export type LibraryWatcherHandle = {
  close: () => Promise<void>;
};

type LibraryWatcherOptions = {
  rootPath: string;
  onBatch: (events: LibraryWatchEvent[]) => void | Promise<void>;
  onError?: (error: unknown) => void;
  debounceMs?: number;
  watchFactory?: (rootPath: string) => LibraryWatcherLike;
};

export function createLibraryWatcher({
  rootPath,
  onBatch,
  onError = () => undefined,
  debounceMs = 500,
  watchFactory = createChokidarWatcher
}: LibraryWatcherOptions): LibraryWatcherHandle {
  const normalizedRoot = path.resolve(rootPath);
  const pendingEvents = new Map<string, LibraryWatchEvent>();
  const watcher = watchFactory(normalizedRoot);
  let timeout: NodeJS.Timeout | null = null;
  let closed = false;

  function schedule(eventType: unknown, filePath: unknown) {
    if (closed || !isLibraryWatchEventType(eventType) || typeof filePath !== "string") {
      return;
    }

    const absolutePath = path.resolve(filePath);

    if (!isInsideRoot(normalizedRoot, absolutePath)) {
      return;
    }

    if (isInternalLibraryPath(normalizedRoot, absolutePath)) {
      return;
    }

    if (!eventType.endsWith("Dir") && !SUPPORTED_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
      return;
    }

    pendingEvents.set(normalizeKey(absolutePath), { type: eventType, absolutePath });

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(flush, debounceMs);
  }

  function flush() {
    timeout = null;

    if (closed || pendingEvents.size === 0) {
      return;
    }

    const events = [...pendingEvents.values()];
    pendingEvents.clear();
    void Promise.resolve(onBatch(events)).catch(onError);
  }

  watcher.on("all", schedule);
  watcher.on("error", onError);

  return {
    async close() {
      closed = true;

      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }

      pendingEvents.clear();
      await watcher.close();
    }
  };
}

function createChokidarWatcher(rootPath: string): LibraryWatcherLike {
  return chokidar.watch(rootPath, {
    ignored: (candidatePath) => isInternalLibraryPath(rootPath, candidatePath),
    ignoreInitial: true,
    atomic: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    },
    usePolling: false
  }) as unknown as LibraryWatcherLike;
}

function isLibraryWatchEventType(value: unknown): value is LibraryWatchEvent["type"] {
  return value === "add" || value === "change" || value === "unlink" || value === "addDir" || value === "unlinkDir";
}

function isInsideRoot(rootPath: string, candidatePath: string): boolean {
  return isPathInside(rootPath, candidatePath);
}

function normalizeKey(filePath: string): string {
  return filePath.replaceAll("\\", "/").toLowerCase();
}
