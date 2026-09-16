import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  extractArchive,
  extractArchiveEntries,
  listArchiveEntries,
  parseSevenZipListOutput
} from "../../electron/services/archiveManager";

let tempRoot: string;

async function createTestSevenZip(): Promise<string> {
  const executablePath = path.join(tempRoot, "7z.exe");
  await writeFile(executablePath, "test executable");
  return executablePath;
}

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "model-archives-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("archiveManager", () => {
  it("lists every regular file and folder in a zip archive", async () => {
    const archivePath = path.join(tempRoot, "complete.zip");
    await writeFile(archivePath, zipSync({
      "models/part.stl": strToU8("solid part\nendsolid part"),
      "docs/readme.pdf": new Uint8Array([1, 2]),
      "preview.jpg": new Uint8Array([3, 4, 5])
    }));

    const result = await listArchiveEntries(tempRoot, archivePath, {
      extractorPath: path.join(tempRoot, "missing-7z.exe")
    });

    expect(result.entries.map((entry) => entry.path)).toEqual([
      "docs/readme.pdf",
      "models/part.stl",
      "preview.jpg"
    ]);
    expect(result.entries.find((entry) => entry.path === "docs/readme.pdf")?.extension)
      .toBe(".pdf");
  });

  it("extracts a complete archive beside the archive in here mode", async () => {
    const archiveFolder = path.join(tempRoot, "archives");
    await mkdir(archiveFolder);
    const archivePath = path.join(archiveFolder, "pack.zip");
    await writeFile(archivePath, zipSync({
      "part.stl": strToU8("part"),
      "docs/readme.pdf": strToU8("instructions")
    }));

    const result = await extractArchive(tempRoot, archivePath, "here", {
      extractorPath: path.join(tempRoot, "missing-7z.exe")
    });

    expect(result.path).toBe(archiveFolder);
    await expect(readFile(path.join(archiveFolder, "part.stl"), "utf8")).resolves.toBe("part");
    await expect(readFile(path.join(archiveFolder, "docs", "readme.pdf"), "utf8"))
      .resolves.toBe("instructions");
  });

  it("avoids a duplicate wrapper when named-folder contents already share the archive name", async () => {
    const archiveFolder = path.join(tempRoot, "archives");
    await mkdir(archiveFolder);
    const archivePath = path.join(archiveFolder, "pack.zip");
    await writeFile(archivePath, zipSync({
      "pack/part.stl": strToU8("part"),
      "pack/preview.png": new Uint8Array([1, 2, 3])
    }));

    const result = await extractArchive(tempRoot, archivePath, "named-folder", {
      extractorPath: path.join(tempRoot, "missing-7z.exe")
    });

    expect(result.path).toBe(path.join(archiveFolder, "pack"));
    await expect(readFile(path.join(archiveFolder, "pack", "part.stl"), "utf8"))
      .resolves.toBe("part");
    await expect(stat(path.join(archiveFolder, "pack", "pack"))).rejects.toThrow("ENOENT");
  });

  it("rejects an unknown whole-archive extraction mode", async () => {
    const archivePath = path.join(tempRoot, "pack.zip");
    await writeFile(archivePath, zipSync({ "part.stl": strToU8("part") }));

    await expect(
      extractArchive(tempRoot, archivePath, "unexpected" as never)
    ).rejects.toThrow("Modo de extracao invalido");
  });

  it("lists all entries inside a zip archive", async () => {
    const archivePath = path.join(tempRoot, "pack.zip");
    await writeFile(
      archivePath,
      zipSync({
        "folder/part.stl": strToU8("solid part\nendsolid part"),
        "folder/model.3mf": new Uint8Array([1, 2, 3]),
        "readme.txt": strToU8("ignore")
      })
    );

    const result = await listArchiveEntries(tempRoot, archivePath);

    expect(result).toEqual({
      ok: true,
      archivePath,
      entries: [
        {
          path: "folder/model.3mf",
          name: "model.3mf",
          extension: ".3mf",
          sizeBytes: 3
        },
        {
          path: "folder/part.stl",
          name: "part.stl",
          extension: ".stl",
          sizeBytes: 24
        },
        {
          path: "readme.txt",
          name: "readme.txt",
          extension: ".txt",
          sizeBytes: 6
        }
      ]
    });
  });

  it("prefers 7-Zip when listing zip archives so large packages are not decompressed eagerly", async () => {
    const archivePath = path.join(tempRoot, "large.zip");
    await writeFile(
      archivePath,
      zipSync({
        "built-in.stl": strToU8("solid built-in\nendsolid built-in")
      })
    );
    const calls: string[][] = [];

    const result = await listArchiveEntries(tempRoot, archivePath, {
      extractorPath: await createTestSevenZip(),
      runSevenZip: async (args) => {
        calls.push(args);
        return {
          stdout: `
Path = from-7zip.3mf
Size = 512
Folder = -
`,
          stderr: ""
        };
      }
    });

    expect(calls).toEqual([["l", "-slt", archivePath]]);
    expect(result.entries).toEqual([
      {
        path: "from-7zip.3mf",
        name: "from-7zip.3mf",
        extension: ".3mf",
        sizeBytes: 512
      }
    ]);
  });

  it("falls back to 7-Zip when a zip archive cannot be read by the built-in reader", async () => {
    const archivePath = path.join(tempRoot, "external.zip");
    await writeFile(archivePath, "not readable by fflate");
    const calls: string[][] = [];

    const result = await listArchiveEntries(tempRoot, archivePath, {
      extractorPath: await createTestSevenZip(),
      runSevenZip: async (args) => {
        calls.push(args);
        return {
          stdout: `
Path = part.stl
Size = 128
Folder = -

Path = notes.txt
Size = 4
Folder = -
`,
          stderr: ""
        };
      }
    });

    expect(calls).toEqual([["l", "-slt", archivePath]]);
    expect(result.entries).toEqual([
      {
        path: "notes.txt",
        name: "notes.txt",
        extension: ".txt",
        sizeBytes: 4
      },
      {
        path: "part.stl",
        name: "part.stl",
        extension: ".stl",
        sizeBytes: 128
      }
    ]);
  });

  it("uses 7-Zip list output even when the command exits with warnings", async () => {
    const archivePath = path.join(tempRoot, "warning.zip");
    await writeFile(archivePath, "not readable by fflate");

    const result = await listArchiveEntries(tempRoot, archivePath, {
      extractorPath: await createTestSevenZip(),
      runSevenZip: async () => {
        throw Object.assign(new Error("Warnings while listing archive"), {
          stdout: `
Path = usable.stl
Size = 64
Folder = -
`,
          stderr: "Warnings: headers error"
        });
      }
    });

    expect(result.entries).toEqual([
      {
        path: "usable.stl",
        name: "usable.stl",
        extension: ".stl",
        sizeBytes: 64
      }
    ]);
  });

  it("extracts selected zip entries into a folder inside the library", async () => {
    await mkdir(path.join(tempRoot, "archives"));
    const archivePath = path.join(tempRoot, "archives", "pack.zip");
    await writeFile(
      archivePath,
      zipSync({
        "folder/part.stl": strToU8("solid part\nendsolid part"),
        "folder/model.3mf": new Uint8Array([1, 2, 3])
      })
    );

    const result = await extractArchiveEntries(tempRoot, archivePath, ["folder/part.stl"]);

    expect(result.message).toBe("1 arquivo extraido.");
    expect(result.paths).toEqual([path.join(tempRoot, "archives", "pack", "folder", "part.stl")]);
    await expect(readFile(path.join(tempRoot, "archives", "pack", "folder", "part.stl"), "utf8"))
      .resolves.toBe("solid part\nendsolid part");
    await expect(stat(path.join(tempRoot, "archives", "pack", "folder", "model.3mf"))).rejects.toThrow(
      "ENOENT"
    );
  });

  it("prefers 7-Zip for selected zip extraction when it is available", async () => {
    await mkdir(path.join(tempRoot, "archives"));
    const archivePath = path.join(tempRoot, "archives", "pack.zip");
    await writeFile(
      archivePath,
      zipSync({
        "folder/part.stl": strToU8("solid part\nendsolid part")
      })
    );
    const calls: string[][] = [];

    const result = await extractArchiveEntries(
      tempRoot,
      archivePath,
      ["folder/part.stl"],
      undefined,
      {
        extractorPath: await createTestSevenZip(),
        runSevenZip: async (args) => {
          calls.push(args);
          return { stdout: "Everything is Ok", stderr: "" };
        }
      }
    );

    const destinationRoot = path.join(tempRoot, "archives", "pack");
    expect(calls).toEqual([
      ["l", "-slt", archivePath],
      ["x", archivePath, `-o${destinationRoot}`, "-y", "folder/part.stl"]
    ]);
    expect(result.paths).toEqual([path.join(destinationRoot, "folder", "part.stl")]);
  });

  it("falls back to 7-Zip when extracting from a zip archive the built-in reader cannot read", async () => {
    await mkdir(path.join(tempRoot, "archives"));
    const archivePath = path.join(tempRoot, "archives", "external.zip");
    await writeFile(archivePath, "not readable by fflate");
    const calls: string[][] = [];

    const result = await extractArchiveEntries(
      tempRoot,
      archivePath,
      ["folder/part.stl"],
      undefined,
      {
        extractorPath: await createTestSevenZip(),
        runSevenZip: async (args) => {
          calls.push(args);
          return { stdout: "Everything is Ok", stderr: "" };
        }
      }
    );

    const destinationRoot = path.join(tempRoot, "archives", "external");
    expect(calls).toEqual([
      ["l", "-slt", archivePath],
      ["x", archivePath, `-o${destinationRoot}`, "-y", "folder/part.stl"]
    ]);
    expect(result.paths).toEqual([path.join(destinationRoot, "folder", "part.stl")]);
  });

  it("refuses to overwrite an existing file when extracting zip entries", async () => {
    await mkdir(path.join(tempRoot, "archives", "pack", "folder"), { recursive: true });
    const archivePath = path.join(tempRoot, "archives", "pack.zip");
    const existingPath = path.join(tempRoot, "archives", "pack", "folder", "part.stl");
    await writeFile(existingPath, "existing model");
    await writeFile(
      archivePath,
      zipSync({
        "folder/part.stl": strToU8("solid part\nendsolid part")
      })
    );

    await expect(extractArchiveEntries(tempRoot, archivePath, ["folder/part.stl"])).rejects.toThrow(
      "Ja existe um arquivo extraido com esse nome"
    );
    await expect(readFile(existingPath, "utf8")).resolves.toBe("existing model");
  });

  it("rejects zip entries that would extract to the same destination", async () => {
    const archivePath = path.join(tempRoot, "archives", "pack.zip");
    await mkdir(path.dirname(archivePath), { recursive: true });
    await writeFile(
      archivePath,
      zipSync({
        "folder/part.stl": strToU8("solid first\nendsolid first"),
        "folder\\part.stl": strToU8("solid second\nendsolid second")
      })
    );

    await expect(
      extractArchiveEntries(tempRoot, archivePath, ["folder/part.stl", "folder\\part.stl"])
    ).rejects.toThrow("Mais de uma entrada extrairia para o mesmo caminho");
    await expect(stat(path.join(tempRoot, "archives", "pack", "folder", "part.stl"))).rejects.toThrow(
      "ENOENT"
    );
  });

  it("rejects zip entries that would extract outside the library", async () => {
    const archivePath = path.join(tempRoot, "bad.zip");
    await writeFile(
      archivePath,
      zipSync({
        "../escape.stl": strToU8("solid escape\nendsolid escape")
      })
    );

    await expect(extractArchiveEntries(tempRoot, archivePath, ["../escape.stl"])).rejects.toThrow(
      "Entrada insegura no arquivo compactado"
    );
  });

  it("rejects unsafe destination folders before extracting", async () => {
    const archivePath = path.join(tempRoot, "pack.zip");
    await writeFile(
      archivePath,
      zipSync({
        "part.stl": strToU8("solid part\nendsolid part")
      })
    );

    await expect(
      extractArchiveEntries(tempRoot, archivePath, ["part.stl"], "safe/../target")
    ).rejects.toThrow("Pasta de destino invalida");
    await expect(stat(path.join(tempRoot, "target", "part.stl"))).rejects.toThrow("ENOENT");
  });

  it("parses all files and folders from 7-Zip technical list output", () => {
    const entries = parseSevenZipListOutput(`
Path = folder
Folder = +
Size = 0

Path = folder/part.stl
Size = 1024
Folder = -

Path = model.3mf
Size = 2048
Folder = -

Path = notes/readme.txt
Size = 12
Folder = -
`);

    expect(entries).toEqual([
      {
        path: "folder",
        name: "folder",
        extension: "",
        sizeBytes: 0,
        isDirectory: true
      },
      {
        path: "folder/part.stl",
        name: "part.stl",
        extension: ".stl",
        sizeBytes: 1024
      },
      {
        path: "model.3mf",
        name: "model.3mf",
        extension: ".3mf",
        sizeBytes: 2048
      },
      {
        path: "notes/readme.txt",
        name: "readme.txt",
        extension: ".txt",
        sizeBytes: 12
      }
    ]);
  });

  it("lists all entries inside a rar archive through 7-Zip", async () => {
    const archivePath = path.join(tempRoot, "pack.rar");
    await writeFile(archivePath, "fake rar");

    const result = await listArchiveEntries(tempRoot, archivePath, {
      extractorPath: await createTestSevenZip(),
      runSevenZip: async () => ({
        stdout: `
Path = part.stl
Size = 33
Folder = -

Path = ignored.txt
Size = 9
Folder = -
`,
        stderr: ""
      })
    });

    expect(result.entries).toEqual([
      {
        path: "ignored.txt",
        name: "ignored.txt",
        extension: ".txt",
        sizeBytes: 9
      },
      {
        path: "part.stl",
        name: "part.stl",
        extension: ".stl",
        sizeBytes: 33
      }
    ]);
  });

  it("extracts selected 7z entries through 7-Zip into the library", async () => {
    await mkdir(path.join(tempRoot, "archives"));
    const archivePath = path.join(tempRoot, "archives", "pack.7z");
    await writeFile(archivePath, "fake 7z");
    const calls: string[][] = [];

    const result = await extractArchiveEntries(tempRoot, archivePath, ["folder/part.stl"], undefined, {
      extractorPath: await createTestSevenZip(),
      runSevenZip: async (args) => {
        calls.push(args);
        return { stdout: "Everything is Ok", stderr: "" };
      }
    });

    const destinationRoot = path.join(tempRoot, "archives", "pack");
    expect(calls).toEqual([
      ["l", "-slt", archivePath],
      ["x", archivePath, `-o${destinationRoot}`, "-y", "folder/part.stl"]
    ]);
    expect(result).toEqual({
      ok: true,
      message: "1 arquivo extraido.",
      paths: [path.join(destinationRoot, "folder", "part.stl")]
    });
  });

  it("refuses to run 7-Zip when an extracted destination already exists", async () => {
    await mkdir(path.join(tempRoot, "archives", "pack", "folder"), { recursive: true });
    const archivePath = path.join(tempRoot, "archives", "pack.7z");
    const existingPath = path.join(tempRoot, "archives", "pack", "folder", "part.stl");
    await writeFile(archivePath, "fake 7z");
    await writeFile(existingPath, "existing model");
    const calls: string[][] = [];

    await expect(
      extractArchiveEntries(tempRoot, archivePath, ["folder/part.stl"], undefined, {
        extractorPath: await createTestSevenZip(),
        runSevenZip: async (args) => {
          calls.push(args);
          return { stdout: "Everything is Ok", stderr: "" };
        }
      })
    ).rejects.toThrow("Ja existe um arquivo extraido com esse nome");
    expect(calls).toEqual([["l", "-slt", archivePath]]);
    await expect(readFile(existingPath, "utf8")).resolves.toBe("existing model");
  });
});
