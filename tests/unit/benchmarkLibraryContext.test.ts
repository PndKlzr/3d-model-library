import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BENCHMARK_LIBRARY_GENERATION,
  BENCHMARK_LIBRARY_ID,
  createBenchmarkLibraryContext
} from "../../electron/services/benchmarkLibraryContext";
import { readLibraryObjPreview } from "../../electron/services/libraryObj";
import type { LibrarySessionRef, LibraryScanResult } from "../../src/shared/types";

describe("benchmark library context", () => {
  it("reads OBJ with its immutable benchmark session without consulting normal state", async () => {
    const rootPath = path.resolve("C:\\Benchmark Models");
    const filePath = path.join(rootPath, "sample.obj");
    const bytes = Buffer.from("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3");
    const normalSession: LibrarySessionRef = {
      rootPath: path.resolve("C:\\Normal Models"),
      libraryId: "normal-library",
      generation: 17
    };
    const getNormalSession = vi.fn(() => normalSession);
    const context = createBenchmarkLibraryContext(rootPath);
    const fileStat = {
      isFile: () => true,
      size: bytes.length,
      dev: 1,
      ino: 2,
      mtimeMs: 3,
      ctimeMs: 4
    };
    const handle = {
      stat: vi.fn(async () => fileStat),
      read: vi.fn(async (target: Uint8Array, offset: number, length: number) => {
        const bytesRead = Math.min(length, bytes.length - offset);
        target.set(bytes.subarray(offset, offset + bytesRead), offset);
        return { bytesRead };
      }),
      close: vi.fn(async () => undefined)
    };

    const result = await readLibraryObjPreview(context.session, filePath, {
      ...context.objAccess,
      fileSystem: {
        realpath: vi.fn(async (value: string) => value),
        open: vi.fn(async () => handle),
        stat: vi.fn(async () => fileStat)
      }
    });

    expect(Buffer.from(result)).toEqual(bytes);
    expect(context.session).toEqual({
      rootPath,
      libraryId: BENCHMARK_LIBRARY_ID,
      generation: BENCHMARK_LIBRARY_GENERATION
    });
    expect(Object.isFrozen(context.session)).toBe(true);
    expect(getNormalSession).not.toHaveBeenCalled();
    expect(normalSession).toEqual({
      rootPath: path.resolve("C:\\Normal Models"),
      libraryId: "normal-library",
      generation: 17
    });
  });

  it("keeps benchmark catalog writes inside its private in-memory index", async () => {
    const rootPath = path.resolve("C:\\Benchmark Models");
    const context = createBenchmarkLibraryContext(rootPath);
    const result: LibraryScanResult = {
      rootPath,
      models: [],
      folders: ["parts"],
      errors: []
    };

    await context.indexStore.save(rootPath, context.session.libraryId, result);

    await expect(context.indexStore.load(rootPath, context.session.libraryId))
      .resolves.toEqual(result);
  });
});
