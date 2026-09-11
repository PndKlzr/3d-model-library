import { open, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInMemoryLibraryIndexStore,
  createLibraryIndexStore,
  LIBRARY_INDEX_FILENAME,
  MAX_LIBRARY_INDEX_BYTES
} from "../../electron/services/libraryIndexStore";
import { PORTABLE_METADATA_DIRECTORY, PORTABLE_METADATA_FILENAME } from "../../electron/services/portableMetadataCodec";
import type { LibraryScanResult } from "../../src/shared/types";

describe("libraryIndexStore", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function makeLibrary() {
    const root = await mkdtemp(path.join(os.tmpdir(), "model-library-index-"));
    roots.push(root);
    return root;
  }

  it("saves and loads a portable index without rotating durable metadata", async () => {
    const root = await makeLibrary();
    const directory = path.join(root, PORTABLE_METADATA_DIRECTORY);
    await mkdir(directory);
    await writeFile(path.join(directory, PORTABLE_METADATA_FILENAME), "durable-primary", "utf8");
    await writeFile(path.join(directory, `${PORTABLE_METADATA_FILENAME}.bak`), "durable-backup", "utf8");
    const store = createLibraryIndexStore({ hideDirectory: async () => undefined });
    const result = scanResult(root);

    await store.save(root, "library-1", result);

    await expect(store.load(root)).resolves.toEqual(result);
    await expect(readFile(path.join(directory, PORTABLE_METADATA_FILENAME), "utf8"))
      .resolves.toBe("durable-primary");
    await expect(readFile(path.join(directory, `${PORTABLE_METADATA_FILENAME}.bak`), "utf8"))
      .resolves.toBe("durable-backup");
  });

  it("returns null for missing, corrupt, incompatible, and oversized indexes", async () => {
    const root = await makeLibrary();
    const directory = path.join(root, PORTABLE_METADATA_DIRECTORY);
    const indexPath = path.join(directory, LIBRARY_INDEX_FILENAME);
    const store = createLibraryIndexStore({ hideDirectory: async () => undefined });
    await expect(store.load(root)).resolves.toBeNull();
    await mkdir(directory);

    await writeFile(indexPath, "{broken", "utf8");
    await expect(store.load(root)).resolves.toBeNull();
    await writeFile(indexPath, JSON.stringify({ schemaVersion: 99 }), "utf8");
    await expect(store.load(root)).resolves.toBeNull();
    await writeFile(indexPath, JSON.stringify({
      schemaVersion: 1,
      libraryId: "library-1",
      savedAt: "not-a-date",
      folders: [],
      files: []
    }), "utf8");
    await expect(store.load(root)).resolves.toBeNull();
    const handle = await open(indexPath, "w");
    await handle.truncate(MAX_LIBRARY_INDEX_BYTES + 1);
    await handle.close();
    await expect(store.load(root)).resolves.toBeNull();
  });

  it("propagates root access failures", async () => {
    const missingRoot = path.join(await makeLibrary(), "missing");
    const store = createLibraryIndexStore({ hideDirectory: async () => undefined });

    await expect(store.load(missingRoot)).rejects.toThrow();
    await expect(store.save(missingRoot, "library-1", scanResult(missingRoot))).rejects.toThrow();
  });

  it("flushes a unique temporary file before atomically replacing the primary", async () => {
    const root = await makeLibrary();
    const directory = path.join(root, PORTABLE_METADATA_DIRECTORY);
    const primaryPath = path.join(directory, LIBRARY_INDEX_FILENAME);
    await mkdir(directory);
    await writeFile(primaryPath, "old-index", "utf8");
    let temporaryPath = "";
    const replaceFile = vi.fn(async (sourcePath: string, destinationPath: string) => {
      temporaryPath = sourcePath;
      expect(destinationPath).toBe(primaryPath);
      expect(sourcePath).not.toBe(primaryPath);
      expect(await readFile(primaryPath, "utf8")).toBe("old-index");
      expect(JSON.parse(await readFile(sourcePath, "utf8"))).toMatchObject({ libraryId: "library-1" });
      await rename(sourcePath, destinationPath);
    });
    const store = createLibraryIndexStore({ hideDirectory: async () => undefined, replaceFile });

    await store.save(root, "library-1", scanResult(root));

    expect(replaceFile).toHaveBeenCalledOnce();
    expect(path.basename(temporaryPath)).toMatch(new RegExp(`^${LIBRARY_INDEX_FILENAME.replaceAll(".", "\\.")}\\..+\\.tmp$`));
  });

  it("cleans only its own temporary file after replacement fails", async () => {
    const root = await makeLibrary();
    const directory = path.join(root, PORTABLE_METADATA_DIRECTORY);
    await mkdir(directory);
    await writeFile(path.join(directory, "somebody-else.tmp"), "keep", "utf8");
    const store = createLibraryIndexStore({
      hideDirectory: async () => undefined,
      replaceFile: async () => { throw new Error("replace failed"); }
    });

    await expect(store.save(root, "library-1", scanResult(root))).rejects.toThrow("replace failed");

    expect(await readdir(directory)).toEqual(["somebody-else.tmp"]);
  });

  it("keeps in-memory snapshots clone-safe and isolated by root", async () => {
    const store = createInMemoryLibraryIndexStore();
    const root = path.resolve("C:/Models");
    const result = scanResult(root);
    await store.save(root, "library-1", result);
    result.models.splice(0);

    const firstRead = await store.load(root);
    firstRead?.models.splice(0);

    await expect(store.load(root)).resolves.toMatchObject({ models: [{ name: "part.stl" }] });
    await expect(store.load(path.resolve("C:/Other"))).resolves.toBeNull();
  });
});

function scanResult(rootPath: string): LibraryScanResult {
  const absolutePath = path.join(rootPath, "part.stl");
  return {
    rootPath,
    folders: [],
    errors: [],
    models: [{
      id: absolutePath,
      name: "part.stl",
      extension: ".stl",
      absolutePath,
      relativeFolder: "",
      sizeBytes: 10,
      modifiedAt: "2026-09-09T00:00:00.000Z",
      dimensionsMm: null,
      objectCount: null,
      previewError: null
    }]
  };
}
