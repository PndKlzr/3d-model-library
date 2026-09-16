import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_ARCHIVE_LIMITS,
  resolveSevenZipExecutable,
  validateArchiveEntries
} from "../../electron/services/archiveSafety";

describe("archive safety limits", () => {
  it("accepts entries within every built-in limit", () => {
    expect(() => validateArchiveEntries([
      { path: "models/part.stl", sizeBytes: 1024 },
      { path: "preview.png", sizeBytes: 2048 }
    ], BUILTIN_ARCHIVE_LIMITS)).not.toThrow();
  });

  it("rejects too many entries", () => {
    const entries = Array.from(
      { length: BUILTIN_ARCHIVE_LIMITS.maxEntries + 1 },
      (_, index) => ({ path: `${index}.stl`, sizeBytes: 0 })
    );

    expect(() => validateArchiveEntries(entries, BUILTIN_ARCHIVE_LIMITS))
      .toThrow("too many entries");
  });

  it("rejects an oversized individual entry", () => {
    expect(() => validateArchiveEntries([{
      path: "huge.stl",
      sizeBytes: BUILTIN_ARCHIVE_LIMITS.maxEntryBytes + 1
    }], BUILTIN_ARCHIVE_LIMITS)).toThrow("entry is too large");
  });

  it("rejects an oversized expanded total", () => {
    expect(() => validateArchiveEntries([
      { path: "one.bin", sizeBytes: BUILTIN_ARCHIVE_LIMITS.maxEntryBytes },
      { path: "two.bin", sizeBytes: BUILTIN_ARCHIVE_LIMITS.maxEntryBytes },
      { path: "three.bin", sizeBytes: 1 }
    ], BUILTIN_ARCHIVE_LIMITS)).toThrow("expanded content is too large");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects invalid entry size %s",
    (sizeBytes) => {
      expect(() => validateArchiveEntries([{ path: "bad.stl", sizeBytes }], BUILTIN_ARCHIVE_LIMITS))
        .toThrow("invalid entry size");
    }
  );
});

describe("resolveSevenZipExecutable", () => {
  const executable = path.resolve("C:/Tools/7-Zip/7z.exe");

  function adapters(options: { directory?: boolean; symbolicLink?: boolean; canonical?: string } = {}) {
    return {
      lstat: async () => ({
        isFile: () => !options.directory,
        isSymbolicLink: () => Boolean(options.symbolicLink)
      }),
      realpath: async () => options.canonical ?? executable,
      stat: async () => ({ isFile: () => !options.directory }),
      findOnPath: async () => null
    };
  }

  it("returns a canonical supported 7-Zip executable", async () => {
    await expect(resolveSevenZipExecutable(executable, adapters())).resolves.toBe(executable);
  });

  it("rejects a relative configured path", async () => {
    await expect(resolveSevenZipExecutable("7z.exe", adapters()))
      .rejects.toThrow("absolute 7-Zip path");
  });

  it("rejects directories", async () => {
    await expect(resolveSevenZipExecutable(executable, adapters({ directory: true })))
      .rejects.toThrow("regular 7-Zip executable");
  });

  it("rejects symbolic links", async () => {
    await expect(resolveSevenZipExecutable(executable, adapters({ symbolicLink: true })))
      .rejects.toThrow("symbolic link");
  });

  it("rejects executable names outside the supported 7-Zip names", async () => {
    const nodePath = path.resolve("C:/Tools/node.exe");
    await expect(resolveSevenZipExecutable(nodePath, adapters({ canonical: nodePath })))
      .rejects.toThrow("7z.exe, 7zz.exe, or 7za.exe");
  });
});
