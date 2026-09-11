import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_DIRECT_IMAGE_BYTES,
  openLibraryImage,
  readLibraryImageDataUrl
} from "../../electron/services/libraryImage";

const cleanupPaths: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(cleanupPaths.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe("library image access", () => {
  it.each([
    ["photo.png", "image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["photo.jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xd9]],
    ["photo.jpeg", "image/jpeg", [0xff, 0xd8, 0xff, 0xd9]],
    ["photo.webp", "image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]]
  ])("returns a MIME-correct data URL for %s", async (name, mime, contents) => {
    const root = await tempLibrary();
    const filePath = path.join(root, name);
    const bytes = Buffer.from(contents);
    await writeFile(filePath, bytes);

    await expect(readLibraryImageDataUrl(root, filePath))
      .resolves.toBe(`data:${mime};base64,${bytes.toString("base64")}`);
  });

  it("rejects images larger than 40 MiB before reading their contents", async () => {
    const root = await tempLibrary();
    const filePath = path.join(root, "large.png");
    const readFile = vi.fn(async () => Buffer.from("unreachable"));

    await expect(readLibraryImageDataUrl(root, filePath, {
      realpath: async (value) => path.resolve(value),
      stat: async () => ({ isFile: () => true, size: MAX_DIRECT_IMAGE_BYTES + 1 }),
      readFile
    })).rejects.toThrow(/40 MiB/i);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rejects a corrupt image payload", async () => {
    const root = await tempLibrary();
    const filePath = path.join(root, "broken.webp");
    await writeFile(filePath, "not an image");

    await expect(readLibraryImageDataUrl(root, filePath)).rejects.toThrow(/corrompida/i);
  });

  it("rejects directories, unsupported formats, missing files, and root escapes", async () => {
    const root = await tempLibrary();
    const outsideRoot = await tempLibrary();
    const directory = path.join(root, "folder.png");
    const textFile = path.join(root, "notes.txt");
    const outside = path.join(outsideRoot, "outside.jpg");
    await mkdir(directory);
    await writeFile(textFile, "text");
    await writeFile(outside, "outside");

    await expect(readLibraryImageDataUrl(root, directory)).rejects.toThrow(/arquivo/i);
    await expect(readLibraryImageDataUrl(root, textFile)).rejects.toThrow(/formato/i);
    await expect(readLibraryImageDataUrl(root, path.join(root, "missing.png"))).rejects.toThrow();
    await expect(readLibraryImageDataUrl(root, outside)).rejects.toThrow(/fora/i);
  });

  it("opens only a validated image and treats a non-empty shell result as failure", async () => {
    const root = await tempLibrary();
    const filePath = path.join(root, "photo.jpg");
    await writeFile(filePath, "image");
    const openPath = vi.fn(async () => "");

    await expect(openLibraryImage(root, filePath, openPath)).resolves.toBeUndefined();
    expect(openPath).toHaveBeenCalledWith(await (await import("node:fs/promises")).realpath(filePath));

    openPath.mockResolvedValueOnce("No application is associated");
    await expect(openLibraryImage(root, filePath, openPath)).rejects.toThrow(
      /No application is associated/
    );
  });
});

async function tempLibrary() {
  const root = await mkdtemp(path.join(os.tmpdir(), "model-library-image-"));
  cleanupPaths.push(root);
  return root;
}
