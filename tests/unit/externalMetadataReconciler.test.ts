import path from "node:path";
import { describe, expect, it } from "vitest";
import { reconcileExternalMetadataMoves } from "../../electron/services/externalMetadataReconciler";
import type {
  FileContentIdentity,
  LibraryMetadata,
  LibraryScanResult,
  ModelFile
} from "../../src/shared/types";

const rootPath = path.resolve("C:/library");
const modifiedAt = "2026-09-16T10:00:00.000Z";

describe("externalMetadataReconciler", () => {
  it("matches a uniquely renamed file by content identity", async () => {
    const oldPath = path.join(rootPath, "old.stl");
    const nextPath = path.join(rootPath, "renamed.stl");
    const identity = fileIdentity("a", 25);

    const moves = await reconcileExternalMetadataMoves({
      rootPath,
      previousScan: scan([model(oldPath, 25)]),
      nextScan: scan([model(nextPath, 25)]),
      metadata: metadata(oldPath, identity),
      identifyFile: async () => identity
    });

    expect(moves).toEqual([{ sourcePath: oldPath, destinationPath: nextPath }]);
  });

  it("matches files after their parent folder is renamed", async () => {
    const oldFirst = path.join(rootPath, "old", "a.stl");
    const oldSecond = path.join(rootPath, "old", "b.3mf");
    const nextFirst = path.join(rootPath, "new", "a.stl");
    const nextSecond = path.join(rootPath, "new", "b.3mf");
    const firstIdentity = fileIdentity("a", 25);
    const secondIdentity = fileIdentity("b", 30);
    const saved = metadata(oldFirst, firstIdentity);
    saved.models[oldSecond] = { favorite: true, tags: [], notes: "" };
    saved.fileIdentities[oldSecond] = secondIdentity;

    const moves = await reconcileExternalMetadataMoves({
      rootPath,
      previousScan: scan([model(oldFirst, 25), model(oldSecond, 30)]),
      nextScan: scan([model(nextFirst, 25), model(nextSecond, 30)]),
      metadata: saved,
      identifyFile: async (filePath) => filePath === nextFirst ? firstIdentity : secondIdentity
    });

    expect(moves).toEqual([
      { sourcePath: oldFirst, destinationPath: nextFirst },
      { sourcePath: oldSecond, destinationPath: nextSecond }
    ]);
  });

  it("does not guess when duplicate content makes the destination ambiguous", async () => {
    const oldPath = path.join(rootPath, "old.stl");
    const firstCopy = path.join(rootPath, "copy-a.stl");
    const secondCopy = path.join(rootPath, "copy-b.stl");
    const identity = fileIdentity("c", 25);

    const moves = await reconcileExternalMetadataMoves({
      rootPath,
      previousScan: scan([model(oldPath, 25)]),
      nextScan: scan([model(firstCopy, 25), model(secondCopy, 25)]),
      metadata: metadata(oldPath, identity),
      identifyFile: async () => identity
    });

    expect(moves).toEqual([]);
  });

  it("can reconnect missing metadata during a later full scan", async () => {
    const oldPath = path.join(rootPath, "missing", "part.stl");
    const nextPath = path.join(rootPath, "found", "part-renamed.stl");
    const identity = fileIdentity("d", 25);

    const moves = await reconcileExternalMetadataMoves({
      rootPath,
      previousScan: null,
      nextScan: scan([model(nextPath, 25)]),
      metadata: metadata(oldPath, identity),
      identifyFile: async () => identity
    });

    expect(moves).toEqual([{ sourcePath: oldPath, destinationPath: nextPath }]);
  });
});

function model(absolutePath: string, sizeBytes: number): ModelFile {
  return {
    id: absolutePath,
    name: path.basename(absolutePath),
    extension: path.extname(absolutePath) as ModelFile["extension"],
    absolutePath,
    relativeFolder: path.relative(rootPath, path.dirname(absolutePath)).replaceAll("\\", "/"),
    sizeBytes,
    modifiedAt,
    dimensionsMm: null,
    objectCount: null,
    previewError: null
  };
}

function scan(models: ModelFile[]): LibraryScanResult {
  return { rootPath, models, folders: [], errors: [] };
}

function fileIdentity(character: string, sizeBytes: number): FileContentIdentity {
  return {
    algorithm: "sha256",
    digest: character.repeat(64),
    sizeBytes,
    modifiedAt
  };
}

function metadata(modelPath: string, identity: FileContentIdentity): LibraryMetadata {
  return {
    models: {
      [modelPath]: { favorite: false, tags: ["important"], notes: "keep" }
    },
    tagCatalog: ["important"],
    slicerHistory: [],
    fileIdentities: { [modelPath]: identity }
  };
}
