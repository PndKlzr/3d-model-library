import path from "node:path";
import type { LibrarySessionRef } from "../../src/shared/types.js";
import { createInMemoryLibraryIndexStore, type LibraryIndexStore } from "./libraryIndexStore.js";
import {
  readLibraryObjPreview,
  type LibraryObjAccess
} from "./libraryObj.js";

export const BENCHMARK_LIBRARY_ID = "benchmark-library";
export const BENCHMARK_LIBRARY_GENERATION = 1;

export type BenchmarkLibraryContext = Readonly<{
  session: Readonly<LibrarySessionRef>;
  indexStore: LibraryIndexStore;
  readObjPreview: (
    expectedSession: LibrarySessionRef,
    absolutePath: string,
    fileSystem?: NonNullable<LibraryObjAccess["fileSystem"]>
  ) => Promise<ArrayBuffer>;
}>;

export function createBenchmarkLibraryContext(canonicalRoot: string): BenchmarkLibraryContext {
  if (!path.isAbsolute(canonicalRoot) || path.resolve(canonicalRoot) !== canonicalRoot) {
    throw new Error("Benchmark library root must be canonical");
  }

  const session = Object.freeze({
    generation: BENCHMARK_LIBRARY_GENERATION,
    rootPath: canonicalRoot,
    libraryId: BENCHMARK_LIBRARY_ID
  });
  const readObjPreview: BenchmarkLibraryContext["readObjPreview"] = (
    expectedSession,
    absolutePath,
    fileSystem
  ) => readLibraryObjPreview(expectedSession, absolutePath, {
    getCurrentSession: () => session,
    fileSystem
  });

  return Object.freeze({
    session,
    readObjPreview,
    indexStore: createInMemoryLibraryIndexStore()
  });
}
