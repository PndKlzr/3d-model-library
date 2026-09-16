import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { showLibraryDataFolder, showLibraryFolder } from "../../electron/services/libraryFolder";
import type { LibrarySessionRef } from "../../src/shared/types";

const root = path.resolve("C:/Models");
const session: LibrarySessionRef = { generation: 4, libraryId: "library-a", rootPath: root };

describe("showLibraryFolder", () => {
  it("opens the canonical library root for an empty relative folder", async () => {
    const harness = createHarness();

    await showLibraryFolder(session, "", harness.access);

    expect(harness.openPath).toHaveBeenCalledWith(root);
  });

  it("opens a canonical nested directory", async () => {
    const nested = path.join(root, "cosplay", "helmet");
    const harness = createHarness({ directories: [root, nested] });

    await showLibraryFolder(session, "cosplay/helmet", harness.access);

    expect(harness.openPath).toHaveBeenCalledWith(nested);
  });

  it.each([
    ["absolute path", path.resolve("C:/Other")],
    ["UNC path", "\\\\server\\share"],
    ["drive-relative path", "D:folder"],
    ["parent traversal", "../outside"],
    ["embedded traversal", "safe/../../outside"]
  ])("rejects %s", async (_label, relativeFolder) => {
    const harness = createHarness();

    await expect(showLibraryFolder(session, relativeFolder, harness.access)).rejects.toThrow(/biblioteca|pasta/i);
    expect(harness.openPath).not.toHaveBeenCalled();
  });

  it("rejects a missing target", async () => {
    const harness = createHarness();
    const missing = path.join(root, "missing");
    harness.realpath.mockImplementation(async (value: string) => {
      if (path.resolve(value) === missing) throw new Error("ENOENT");
      return path.resolve(value);
    });

    await expect(showLibraryFolder(session, "missing", harness.access)).rejects.toThrow(/pasta/i);
    expect(harness.realpath).toHaveBeenCalledWith(missing);
  });

  it("rejects a file target", async () => {
    const file = path.join(root, "part.stl");
    const harness = createHarness({ directories: [root], canonical: new Map([[file, file]]) });

    await expect(showLibraryFolder(session, "part.stl", harness.access)).rejects.toThrow(/pasta/i);
    expect(harness.openPath).not.toHaveBeenCalled();
  });

  it("rejects a symlink whose live target escapes the library", async () => {
    const link = path.join(root, "linked");
    const outside = path.resolve("C:/Outside");
    const harness = createHarness({
      directories: [root, outside],
      canonical: new Map([[link, outside]])
    });

    await expect(showLibraryFolder(session, "linked", harness.access)).rejects.toThrow(/biblioteca/i);
    expect(harness.openPath).not.toHaveBeenCalled();
  });

  it("rejects a stale session immediately before opening Explorer", async () => {
    const nested = path.join(root, "cosplay");
    const harness = createHarness({ directories: [root, nested] });
    let statCalls = 0;
    harness.stat.mockImplementation(async (value: string) => {
      statCalls += 1;
      if (statCalls === 4) {
        harness.currentSession = { ...session, generation: session.generation + 1 };
      }
      return { isDirectory: () => [root, nested].includes(path.resolve(value)) };
    });

    await expect(showLibraryFolder(session, "cosplay", harness.access)).rejects.toThrow(/sessão/i);
    expect(harness.openPath).not.toHaveBeenCalled();
  });

  it("treats a non-empty shell.openPath result as failure", async () => {
    const harness = createHarness();
    harness.openPath.mockResolvedValue("Explorer indisponível");

    await expect(showLibraryFolder(session, "", harness.access)).rejects.toThrow("Explorer indisponível");
  });

  it("does not publish success when the session changes while Explorer opens", async () => {
    const harness = createHarness();
    harness.openPath.mockImplementation(async () => {
      harness.currentSession = { ...session, generation: session.generation + 1 };
      return "";
    });

    await expect(showLibraryFolder(session, "", harness.access)).rejects.toThrow(/sessão/i);
  });
});

describe("showLibraryDataFolder", () => {
  it("opens only the active library internal data directory", async () => {
    const harness = createHarness();
    const dataDirectory = path.join(root, ".3d-model-library");
    const getDataDirectory = vi.fn(async () => dataDirectory);

    await showLibraryDataFolder(session, {
      getCurrentSession: () => harness.currentSession,
      getDataDirectory,
      openPath: harness.openPath
    });

    expect(getDataDirectory).toHaveBeenCalledWith(root);
    expect(harness.openPath).toHaveBeenCalledWith(dataDirectory);
  });

  it("rejects a changed session before opening the internal directory", async () => {
    const harness = createHarness();

    await expect(showLibraryDataFolder(session, {
      getCurrentSession: () => harness.currentSession,
      getDataDirectory: async () => {
        harness.currentSession = { ...session, generation: session.generation + 1 };
        return path.join(root, ".3d-model-library");
      },
      openPath: harness.openPath
    })).rejects.toThrow(/sessão/i);
    expect(harness.openPath).not.toHaveBeenCalled();
  });

  it("rejects a repository result other than the exact internal directory", async () => {
    const harness = createHarness();

    await expect(showLibraryDataFolder(session, {
      getCurrentSession: () => harness.currentSession,
      getDataDirectory: async () => path.join(root, "other"),
      openPath: harness.openPath
    })).rejects.toThrow(/dados/i);
    expect(harness.openPath).not.toHaveBeenCalled();
  });
});

function createHarness(options: {
  directories?: string[];
  canonical?: Map<string, string>;
} = {}) {
  const directories = new Set(options.directories ?? [root]);
  const canonical = options.canonical ?? new Map<string, string>();
  const harness = {
    currentSession: session as LibrarySessionRef | null,
    realpath: vi.fn(async (value: string) => canonical.get(path.resolve(value)) ?? path.resolve(value)),
    stat: vi.fn(async (value: string) => ({ isDirectory: () => directories.has(path.resolve(value)) })),
    openPath: vi.fn(async (_value: string) => ""),
    access: undefined as unknown as {
      getCurrentSession: () => LibrarySessionRef | null;
      openPath: ReturnType<typeof vi.fn>;
      fileSystem: { realpath: ReturnType<typeof vi.fn>; stat: ReturnType<typeof vi.fn> };
    }
  };
  harness.access = {
    getCurrentSession: () => harness.currentSession,
    openPath: harness.openPath,
    fileSystem: { realpath: harness.realpath, stat: harness.stat }
  };
  return harness;
}
