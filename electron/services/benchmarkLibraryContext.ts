import path from "node:path";
import type { LibrarySessionRef } from "../../src/shared/types.js";
import { createInMemoryLibraryIndexStore, type LibraryIndexStore } from "./libraryIndexStore.js";
import type { LibraryObjAccess } from "./libraryObj.js";

export const BENCHMARK_LIBRARY_ID = "benchmark-library";
export const BENCHMARK_LIBRARY_GENERATION = 1;

export type BenchmarkLibraryContext = Readonly<{
  session: Readonly<LibrarySessionRef>;
  indexStore: LibraryIndexStore;
  objAccess: LibraryObjAccess;
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
  const objAccess = Object.freeze({ getCurrentSession: () => session });

  return Object.freeze({
    session,
    objAccess,
    indexStore: createInMemoryLibraryIndexStore()
  });
}
