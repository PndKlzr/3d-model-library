import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibrarySessionRef } from "../../src/shared/types";
import {
  MAX_DIRECT_IMAGE_BYTES,
  openLibraryImage,
  readLibraryImageDataUrl
} from "../../electron/services/libraryImage";

const cleanupPaths: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(cleanupPaths.splice(0).map((target) =>
    rm(target, { recursive: true, force: true })
  ));
});

describe("library image access", () => {
  it.each([
    ["photo.png", "image/png", pngHeader()],
    ["photo.jpg", "image/jpeg", jpegHeader()],
    ["photo.jpeg", "image/jpeg", jpegHeader()],
    ["photo.webp", "image/webp", webpHeader()]
  ])("returns a MIME-correct data URL for %s", async (name, mime, contents) => {
    const root = await tempLibrary();
    const filePath = path.join(root, name);
    const bytes = Buffer.from(contents);
    await writeFile(filePath, bytes);
    const current = currentSession(root);

    await expect(readLibraryImageDataUrl(current.value, filePath, access(current)))
      .resolves.toBe(`data:${mime};base64,${bytes.toString("base64")}`);
  });

  it("passes the verified WebP extension to the platform decoder", async () => {
    const root = await tempLibrary();
    const filePath = path.join(root, "photo.webp");
    await writeFile(filePath, Buffer.from(webpHeader()));
    const current = currentSession(root);
    const decodeImage = vi.fn(() => true);

    await readLibraryImageDataUrl(current.value, filePath, {
      ...access(current),
      decodeImage
    });

    expect(decodeImage).toHaveBeenCalledWith(expect.anything(), ".webp");
  });

  it.each([
    ["photo.jpg", jpegHeader()],
    ["photo.jpeg", jpegHeader()]
  ])("accepts JPEG bytes for the equivalent %s extension", async (name, contents) => {
    const root = await tempLibrary();
    const filePath = path.join(root, name);
    const bytes = Buffer.from(contents);
    await writeFile(filePath, bytes);
    const current = currentSession(root);

    await expect(readLibraryImageDataUrl(current.value, filePath, access(current)))
      .resolves.toBe(`data:image/jpeg;base64,${bytes.toString("base64")}`);
  });

  it.each([
    ["renamed.jpg", "image/png", ".png", pngHeader()],
    ["renamed.png", "image/webp", ".webp", webpHeader()]
  ])("uses the verified image format when %s has the wrong extension", async (
    name,
    mime,
    decodedExtension,
    contents
  ) => {
    const root = await tempLibrary();
    const filePath = path.join(root, name);
    const bytes = Buffer.from(contents);
    await writeFile(filePath, bytes);
    const current = currentSession(root);
    const decodeImage = vi.fn(() => true);

    await expect(readLibraryImageDataUrl(current.value, filePath, {
      ...access(current),
      decodeImage
    })).resolves.toBe(`data:${mime};base64,${bytes.toString("base64")}`);
    expect(decodeImage).toHaveBeenCalledWith(expect.anything(), decodedExtension);
  });

  it("rejects a superficially valid but undecodable image", async () => {
    const root = await tempLibrary();
    const filePath = path.join(root, "truncated.png");
    await writeFile(filePath, Buffer.from(pngHeader()));
    const current = currentSession(root);
    const decodeImage = vi.fn(() => false);

    await expect(readLibraryImageDataUrl(current.value, filePath, {
      ...access(current),
      decodeImage
    })).rejects.toThrow(/decodificada|corrompida/i);
    expect(decodeImage).toHaveBeenCalledOnce();
  });

  it("rejects a session switched while the descriptor read is in progress", async () => {
    const root = path.resolve("C:\\Models");
    const expected = session(root, "library-a", 1);
    const current = { value: expected };
    const handle = descriptor(Buffer.from(pngHeader()), {
      onRead: () => { current.value = session("C:\\Other", "library-b", 2); }
    });

    await expect(readLibraryImageDataUrl(expected, path.join(root, "photo.png"), {
      ...access(current),
      fileSystem: mockFileSystem(root, path.join(root, "photo.png"), handle)
    })).rejects.toThrow(/sessão.*alterada|stale/i);
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("does not call the shell when the session changes before opening", async () => {
    const root = path.resolve("C:\\Models");
    const expected = session(root, "library-a", 1);
    const current = { value: expected };
    const handle = descriptor(Buffer.from(jpegHeader()), {
      onClose: () => { current.value = session("C:\\Other", "library-b", 2); }
    });
    const openPath = vi.fn(async () => "");

    await expect(openLibraryImage(expected, path.join(root, "photo.jpg"), {
      ...access(current),
      openPath,
      fileSystem: mockFileSystem(root, path.join(root, "photo.jpg"), handle)
    })).rejects.toThrow(/sessão.*alterada|stale/i);
    expect(openPath).not.toHaveBeenCalled();
  });

  it("enforces 40 MiB from fstat on the opened descriptor", async () => {
    const root = path.resolve("C:\\Models");
    const expected = session(root);
    const current = { value: expected };
    const handle = descriptor(Buffer.alloc(0), { size: MAX_DIRECT_IMAGE_BYTES + 1 });

    await expect(readLibraryImageDataUrl(expected, path.join(root, "large.png"), {
      ...access(current),
      fileSystem: mockFileSystem(root, path.join(root, "large.png"), handle)
    })).rejects.toThrow(/40 MiB/i);
    expect(handle.read).not.toHaveBeenCalled();
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("rejects a file that grows after the bounded descriptor read", async () => {
    const root = path.resolve("C:\\Models");
    const expected = session(root);
    const current = { value: expected };
    const bytes = Buffer.from(pngHeader());
    const handle = descriptor(bytes, { postReadSize: bytes.length + 1 });

    await expect(readLibraryImageDataUrl(expected, path.join(root, "growing.png"), {
      ...access(current),
      fileSystem: mockFileSystem(root, path.join(root, "growing.png"), handle)
    })).rejects.toThrow(/alterad[ao] durante a leitura/i);
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("rejects short reads and always closes the descriptor", async () => {
    const root = path.resolve("C:\\Models");
    const expected = session(root);
    const current = { value: expected };
    const handle = descriptor(Buffer.from(pngHeader()), { bytesRead: 2, endAfterFirstRead: true });

    await expect(readLibraryImageDataUrl(expected, path.join(root, "short.png"), {
      ...access(current),
      fileSystem: mockFileSystem(root, path.join(root, "short.png"), handle)
    })).rejects.toThrow(/alterad[ao] durante a leitura/i);
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("rejects directories, unsupported formats, missing files, and canonical escapes", async () => {
    const root = await tempLibrary();
    const outsideRoot = await tempLibrary();
    const directory = path.join(root, "folder.png");
    const textFile = path.join(root, "notes.txt");
    const outside = path.join(outsideRoot, "outside.jpg");
    await mkdir(directory);
    await writeFile(textFile, "text");
    await writeFile(outside, Buffer.from(jpegHeader()));
    const current = currentSession(root);

    await expect(readLibraryImageDataUrl(current.value, directory, access(current)))
      .rejects.toThrow(/arquivo/i);
    await expect(readLibraryImageDataUrl(current.value, textFile, access(current)))
      .rejects.toThrow(/formato/i);
    await expect(readLibraryImageDataUrl(
      current.value,
      path.join(root, "missing.png"),
      access(current)
    )).rejects.toThrow();
    await expect(readLibraryImageDataUrl(current.value, outside, access(current)))
      .rejects.toThrow(/fora/i);
  });

  it("rejects a canonicalized symlink target outside the root in deterministic fixtures", async () => {
    const root = path.resolve("C:\\Models");
    const link = path.join(root, "linked.jpg");
    const outside = path.resolve("C:\\Outside\\photo.jpg");
    const expected = session(root);
    const current = { value: expected };
    const fileSystem = {
      realpath: vi.fn(async (value: string) => value === root ? root : outside),
      open: vi.fn()
    };

    await expect(readLibraryImageDataUrl(expected, link, {
      ...access(current),
      fileSystem
    })).rejects.toThrow(/fora/i);
    expect(fileSystem.open).not.toHaveBeenCalled();
  });

  it("rejects a real symlink to an image outside the library when Windows permits it", async () => {
    const root = await tempLibrary();
    const outsideRoot = await tempLibrary();
    const outside = path.join(outsideRoot, "outside.jpg");
    const link = path.join(root, "linked.jpg");
    await writeFile(outside, Buffer.from(jpegHeader()));

    try {
      await symlink(outside, link, "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }

    const current = currentSession(root);
    await expect(readLibraryImageDataUrl(current.value, link, access(current)))
      .rejects.toThrow(/fora/i);
  });

  it("opens only a validated image and treats a non-empty shell result as failure", async () => {
    const root = await tempLibrary();
    const filePath = path.join(root, "photo.jpg");
    await writeFile(filePath, Buffer.from(jpegHeader()));
    const current = currentSession(root);
    const openPath = vi.fn(async () => "");

    await expect(openLibraryImage(current.value, filePath, {
      ...access(current),
      openPath
    })).resolves.toBeUndefined();
    expect(openPath).toHaveBeenCalledWith(await (await import("node:fs/promises")).realpath(filePath));

    openPath.mockResolvedValueOnce("No application is associated");
    await expect(openLibraryImage(current.value, filePath, {
      ...access(current),
      openPath
    })).rejects.toThrow(/No application is associated/);
  });
});

function access(current: { value: LibrarySessionRef }) {
  return {
    getCurrentSession: () => current.value,
    decodeImage: () => true,
    openPath: async () => ""
  };
}

function currentSession(rootPath: string) {
  return { value: session(rootPath) };
}

function session(rootPath: string, libraryId = "library-a", generation = 1): LibrarySessionRef {
  return { rootPath, libraryId, generation };
}

function descriptor(
  bytes: Buffer,
  options: {
    size?: number;
    postReadSize?: number;
    bytesRead?: number;
    endAfterFirstRead?: boolean;
    onRead?: () => void;
    onClose?: () => void;
  } = {}
) {
  let statCalls = 0;
  let readCalls = 0;
  return {
    stat: vi.fn(async () => ({
      isFile: () => true,
      size: statCalls++ === 0
        ? options.size ?? bytes.length
        : options.postReadSize ?? options.size ?? bytes.length
    })),
    read: vi.fn(async (buffer: Uint8Array, offset: number, length: number) => {
      options.onRead?.();
      if (options.endAfterFirstRead && readCalls++ > 0) return { bytesRead: 0 };
      const bytesRead = Math.min(options.bytesRead ?? length, bytes.length);
      buffer.set(bytes.subarray(0, bytesRead), offset);
      return { bytesRead };
    }),
    close: vi.fn(async () => { options.onClose?.(); })
  };
}

function mockFileSystem(root: string, filePath: string, handle: ReturnType<typeof descriptor>) {
  return {
    realpath: vi.fn(async (value: string) => value === root ? root : filePath),
    open: vi.fn(async () => handle)
  };
}

function pngHeader() {
  return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
}

function jpegHeader() {
  return [0xff, 0xd8, 0xff, 0xd9];
}

function webpHeader() {
  return [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
}

async function tempLibrary() {
  const root = await mkdtemp(path.join(os.tmpdir(), "model-library-image-"));
  cleanupPaths.push(root);
  return root;
}
