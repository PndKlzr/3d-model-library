import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveCanonicalLibraryFile } from "../../electron/services/libraryFileAccess";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function createLibraryFixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), "model-library-access-"));
  temporaryDirectories.push(parent);
  const root = path.join(parent, "library");
  await mkdir(root);
  return { parent, root };
}

describe("resolveCanonicalLibraryFile", () => {
  it("returns the canonical path for a regular file inside the library", async () => {
    const { root } = await createLibraryFixture();
    const modelPath = path.join(root, "part.stl");
    await writeFile(modelPath, "solid part");

    await expect(resolveCanonicalLibraryFile(root, modelPath)).resolves.toBe(
      await realpath(modelPath)
    );
  });

  it("rejects a missing file", async () => {
    const { root } = await createLibraryFixture();

    await expect(resolveCanonicalLibraryFile(root, path.join(root, "missing.stl")))
      .rejects.toThrow("does not exist");
  });

  it("rejects a directory", async () => {
    const { root } = await createLibraryFixture();

    await expect(resolveCanonicalLibraryFile(root, root)).rejects.toThrow("regular file");
  });

  it("rejects a regular file outside the library", async () => {
    const { parent, root } = await createLibraryFixture();
    const outsidePath = path.join(parent, "outside.stl");
    await writeFile(outsidePath, "solid outside");

    await expect(resolveCanonicalLibraryFile(root, outsidePath))
      .rejects.toThrow("outside the library");
  });

  it("rejects a junction-style path whose canonical target escapes the library", async () => {
    const root = path.resolve("C:/Library");
    const candidate = path.join(root, "linked", "secret.stl");
    const outside = path.resolve("C:/Outside/secret.stl");

    await expect(resolveCanonicalLibraryFile(root, candidate, {
      realpath: async (value) => value === root ? root : outside,
      stat: async () => ({ isFile: () => true })
    })).rejects.toThrow("outside the library");
  });

  it.each(["relative/file.stl", "bad\0file.stl"])("rejects invalid path %s", async (candidate) => {
    const { root } = await createLibraryFixture();

    await expect(resolveCanonicalLibraryFile(root, candidate)).rejects.toThrow("Invalid library file path");
  });
});
