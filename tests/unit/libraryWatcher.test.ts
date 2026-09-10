import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createLibraryWatcher,
  type LibraryWatcherLike
} from "../../electron/services/libraryWatcher";
import type { LibraryWatchEvent } from "../../src/shared/types";

describe("libraryWatcher", () => {
  it("coalesces supported changes and ignores unrelated files", async () => {
    vi.useFakeTimers();
    const fakeWatcher = createFakeWatcher();
    const batches: LibraryWatchEvent[][] = [];
    const rootPath = path.resolve("C:\\Models");
    const watcher = createLibraryWatcher({
      rootPath,
      debounceMs: 50,
      onBatch: (batch) => batches.push(batch),
      watchFactory: () => fakeWatcher
    });

    fakeWatcher.emit("all", "add", path.join(rootPath, "part.stl"));
    fakeWatcher.emit("all", "add", path.join(rootPath, "notes.txt"));
    fakeWatcher.emit("all", "addDir", path.join(rootPath, "Props"));
    await vi.advanceTimersByTimeAsync(51);

    expect(batches).toEqual([[
      { type: "add", absolutePath: path.join(rootPath, "part.stl") },
      { type: "addDir", absolutePath: path.join(rootPath, "Props") }
    ]]);
    await watcher.close();
    vi.useRealTimers();
  });

  it("keeps only the latest event for the same path in a debounce window", async () => {
    vi.useFakeTimers();
    const fakeWatcher = createFakeWatcher();
    const batches: LibraryWatchEvent[][] = [];
    const rootPath = path.resolve("C:\\Models");
    const watcher = createLibraryWatcher({
      rootPath,
      debounceMs: 25,
      onBatch: (batch) => batches.push(batch),
      watchFactory: () => fakeWatcher
    });
    const modelPath = path.join(rootPath, "part.stl");

    fakeWatcher.emit("all", "add", modelPath);
    fakeWatcher.emit("all", "change", modelPath);
    await vi.advanceTimersByTimeAsync(26);

    expect(batches).toEqual([[{ type: "change", absolutePath: modelPath }]]);
    await watcher.close();
    vi.useRealTimers();
  });

  it("cancels pending delivery and closes the native watcher", async () => {
    vi.useFakeTimers();
    const fakeWatcher = createFakeWatcher();
    const onBatch = vi.fn();
    const rootPath = path.resolve("C:\\Models");
    const watcher = createLibraryWatcher({
      rootPath,
      debounceMs: 25,
      onBatch,
      watchFactory: () => fakeWatcher
    });

    fakeWatcher.emit("all", "add", path.join(rootPath, "part.stl"));
    await watcher.close();
    await vi.advanceTimersByTimeAsync(30);

    expect(onBatch).not.toHaveBeenCalled();
    expect(fakeWatcher.close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("ignores every event beneath the internal metadata directory", async () => {
    vi.useFakeTimers();
    const fakeWatcher = createFakeWatcher();
    const onBatch = vi.fn();
    const rootPath = path.resolve("C:\\Models");
    const watcher = createLibraryWatcher({
      rootPath,
      debounceMs: 25,
      onBatch,
      watchFactory: () => fakeWatcher
    });
    const internalDirectory = path.join(rootPath, ".3d-model-library");

    fakeWatcher.emit("all", "addDir", internalDirectory);
    fakeWatcher.emit("all", "add", path.join(internalDirectory, "hidden.stl"));
    fakeWatcher.emit("all", "change", path.join(internalDirectory, "data.3mf"));
    fakeWatcher.emit("all", "unlink", path.join(internalDirectory, "old.stl"));
    fakeWatcher.emit("all", "unlinkDir", path.join(internalDirectory, "nested"));
    await vi.advanceTimersByTimeAsync(30);

    expect(onBatch).not.toHaveBeenCalled();
    await watcher.close();
    vi.useRealTimers();
  });
});

function createFakeWatcher() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const watcher: LibraryWatcherLike & { emit: (name: string, ...args: unknown[]) => void } = {
    on(name, listener) {
      listeners.set(name, listener);
      return watcher;
    },
    close: vi.fn(async () => undefined),
    emit(name, ...args) {
      listeners.get(name)?.(...args);
    }
  };
  return watcher;
}
