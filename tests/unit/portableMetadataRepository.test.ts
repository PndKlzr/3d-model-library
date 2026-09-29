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

  it("exports and inspects a validated portable backup without absolute paths", async () => {
    const root = await makeLibrary();
    const destination = path.join(await makeLibrary(), "library-backup.json");
    const repository = createPortableMetadataRepository({ hideDirectory: async () => undefined });
    const manifest = validManifest("library-id", "2026-09-09T10:00:00.000Z");
    manifest.tagCatalog = ["util"];
    manifest.models["parts/model.stl"] = {
      favorite: true,
      tags: ["util"],
      notes: "Print slowly"
    };

    await repository.exportBackup(root, manifest, destination);
    const inspected = await repository.readExternalBackup(root, destination);
    const serialized = await readFile(destination, "utf8");

    expect(inspected.preview).toEqual({
      libraryId: "library-id",
      updatedAt: "2026-09-09T10:00:00.000Z",
      modelCount: 1,
      tagCount: 1,
      historyCount: 0
    });
    expect(inspected.manifest.models["parts/model.stl"]?.notes).toBe("Print slowly");
    expect(serialized).not.toContain(root);
  });

  it("rejects traversal-bearing and symbolic-link external backups", async () => {
    const root = await makeLibrary();
    const external = await makeLibrary();
    const source = path.join(external, "unsafe.json");
    const linked = path.join(external, "linked.json");
    const repository = createPortableMetadataRepository({ hideDirectory: async () => undefined });
    const unsafe = validManifest("foreign", "2026-09-09T10:00:00.000Z") as unknown as {
      models: Record<string, unknown>;
    };
    unsafe.models["../escape.stl"] = { favorite: false, tags: [], notes: "" };
    await writeFile(source, JSON.stringify(unsafe), "utf8");

    await expect(repository.readExternalBackup(root, source)).rejects.toThrow(/relative|escape/i);

    try {
      await import("node:fs/promises").then(({ symlink }) => symlink(source, linked, "file"));
      await expect(repository.readExternalBackup(root, linked)).rejects.toThrow(/link|regular/i);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }
  });

  it("snapshots current metadata before restore and retains five recovery files", async () => {
    const root = await makeLibrary();
    let tick = 0;
    const repository = createPortableMetadataRepository({
      hideDirectory: async () => undefined,
      now: () => new Date(Date.UTC(2026, 8, 9, 10, 0, tick++))
    });
    let current = validManifest("library-id", "2026-09-09T09:00:00.000Z");
    await repository.save(root, current);

    for (let index = 0; index < 7; index += 1) {
      const replacement = validManifest(
        "library-id",
        `2026-09-09T10:00:0${index}.000Z`
      );
      await repository.restoreBackup(root, current, replacement);
      current = replacement;
    }

    const directory = await repository.getDataDirectory(root);
    const recoveryFiles = (await readdir(directory))
      .filter((name) => name.startsWith("3D_LIBRARY_DATA_RECOVERY_") && name.endsWith(".json"));
    expect(recoveryFiles).toHaveLength(5);
    await expect(repository.load(root)).resolves.toMatchObject({ manifest: current });
  });

  it("keeps the primary metadata when restore replacement fails", async () => {
    const root = await makeLibrary();
    const stable = createPortableMetadataRepository({ hideDirectory: async () => undefined });
    const current = validManifest("library-id", "2026-09-09T09:00:00.000Z");
    await stable.save(root, current);
    const failing = createPortableMetadataRepository({
      hideDirectory: async () => undefined,
      replaceFile: async (source, destination) => {
        if (destination.endsWith(PORTABLE_METADATA_FILENAME)) throw new Error("replace failed");
        await import("node:fs/promises").then(({ rename }) => rename(source, destination));
      }
    });

    await expect(failing.restoreBackup(
      root,
      current,
      validManifest("library-id", "2026-09-09T10:00:00.000Z")
    )).rejects.toThrow("replace failed");
    await expect(stable.load(root)).resolves.toMatchObject({ manifest: current });
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
