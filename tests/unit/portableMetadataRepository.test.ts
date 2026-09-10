import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PORTABLE_METADATA_DIRECTORY,
  PORTABLE_METADATA_FILENAME,
  type PortableLibraryManifestV1
} from "../../electron/services/portableMetadataCodec";
import { createPortableMetadataRepository } from "../../electron/services/portableMetadataRepository";

describe("portableMetadataRepository", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function makeLibrary() {
    const root = await mkdtemp(path.join(os.tmpdir(), "model-library-portable-"));
    roots.push(root);
    return root;
  }

  it("loads an empty writable library", async () => {
    const root = await makeLibrary();
    const repository = createPortableMetadataRepository({ hideDirectory: async () => undefined });

    await expect(repository.load(root)).resolves.toMatchObject({
      manifest: null,
      source: "empty",
      warning: null,
      corruptPrimaryPath: null
    });
    await expect(repository.checkWritable(root)).resolves.toBe(true);
  });

  it("writes, reloads, and backs up the previous valid primary", async () => {
    const root = await makeLibrary();
    const hideDirectory = vi.fn(async () => undefined);
    const repository = createPortableMetadataRepository({ hideDirectory });

    await repository.save(root, validManifest("library-id", "2026-09-09T10:00:00.000Z"));
    await repository.save(root, validManifest("library-id", "2026-09-09T11:00:00.000Z"));

    const directory = path.join(root, PORTABLE_METADATA_DIRECTORY);
    const primary = JSON.parse(
      await readFile(path.join(directory, PORTABLE_METADATA_FILENAME), "utf8")
    );
    const backup = JSON.parse(
      await readFile(path.join(directory, `${PORTABLE_METADATA_FILENAME}.bak`), "utf8")
    );

    expect(primary.updatedAt).toBe("2026-09-09T11:00:00.000Z");
    expect(backup.updatedAt).toBe("2026-09-09T10:00:00.000Z");
    expect((await repository.load(root)).manifest).toMatchObject({
      updatedAt: "2026-09-09T11:00:00.000Z"
    });
    expect(hideDirectory).toHaveBeenCalledWith(directory);
  });

  it("loads a valid backup and preserves corrupt evidence during repair", async () => {
    const root = await makeLibrary();
    const repository = createPortableMetadataRepository({ hideDirectory: async () => undefined });
    const directory = path.join(root, PORTABLE_METADATA_DIRECTORY);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, PORTABLE_METADATA_FILENAME), "{broken", "utf8");
    await writeFile(
      path.join(directory, `${PORTABLE_METADATA_FILENAME}.bak`),
      JSON.stringify(validManifest("backup-id", "2026-09-09T10:00:00.000Z")),
      "utf8"
    );

    const loaded = await repository.load(root);
    expect(loaded.source).toBe("backup");
    expect(loaded.warning).toMatch(/backup/i);
    expect(loaded.corruptPrimaryPath).toBeTruthy();

    await repository.save(root, validManifest("backup-id", "2026-09-09T11:00:00.000Z"), {
      corruptPrimaryPath: loaded.corruptPrimaryPath
    });

    const names = await readdir(directory);
    expect(names.some((name) => name.endsWith(".corrupt"))).toBe(true);
    expect(
      JSON.parse(
        await readFile(path.join(directory, `${PORTABLE_METADATA_FILENAME}.bak`), "utf8")
      )
    ).toMatchObject({ libraryId: "backup-id", updatedAt: "2026-09-09T10:00:00.000Z" });
    expect(
      JSON.parse(await readFile(path.join(directory, PORTABLE_METADATA_FILENAME), "utf8"))
    ).toMatchObject({ libraryId: "backup-id", updatedAt: "2026-09-09T11:00:00.000Z" });
  });

  it("rejects an oversized manifest before parsing", async () => {
    const root = await makeLibrary();
    const repository = createPortableMetadataRepository({
      hideDirectory: async () => undefined,
      maximumBytes: 32
    });
    const directory = path.join(root, PORTABLE_METADATA_DIRECTORY);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, PORTABLE_METADATA_FILENAME), "x".repeat(33), "utf8");

    await expect(repository.load(root)).rejects.toThrow(/grande|size/i);
  });

  it("removes temporary files when a primary replacement fails", async () => {
    const root = await makeLibrary();
    const repository = createPortableMetadataRepository({
      hideDirectory: async () => undefined,
      replaceFile: async () => {
        throw new Error("replace failed");
      }
    });

    await expect(
      repository.save(root, validManifest("library-id", "2026-09-09T10:00:00.000Z"))
    ).rejects.toThrow(
      "replace failed"
    );

    const directory = path.join(root, PORTABLE_METADATA_DIRECTORY);
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("reports a missing root as not writable", async () => {
    const root = path.join(await makeLibrary(), "missing");
    const repository = createPortableMetadataRepository({ hideDirectory: async () => undefined });

    await expect(repository.checkWritable(root)).resolves.toBe(false);
    await expect(repository.canonicalizeRoot(root)).rejects.toThrow();
  });
});

function validManifest(libraryId: string, updatedAt: string): PortableLibraryManifestV1 {
  return {
    schemaVersion: 1,
    libraryId,
    updatedAt,
    tagCatalog: [],
    models: {},
    slicerHistory: []
  };
}
