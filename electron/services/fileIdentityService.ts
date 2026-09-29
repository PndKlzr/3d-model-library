import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { FileContentIdentity } from "../../src/shared/types.js";

type FileStatSnapshot = {
  size: number;
  modifiedAt: string;
};

type StableIdentityOptions = {
  statFile?: (absolutePath: string) => Promise<FileStatSnapshot>;
  hashFile?: (absolutePath: string) => Promise<string>;
};

export type FileIdentityService = {
  identify: (absolutePath: string) => Promise<FileContentIdentity | null>;
};

export function createFileIdentityService({
  computeIdentity = computeStableFileIdentity
}: {
  computeIdentity?: (absolutePath: string) => Promise<FileContentIdentity | null>;
} = {}): FileIdentityService {
  let tail = Promise.resolve();

  return {
    identify(absolutePath) {
      const result = tail.then(() => computeIdentity(absolutePath));
      tail = result.then(() => undefined, () => undefined);
      return result;
    }
  };
}

export async function computeStableFileIdentity(
  absolutePath: string,
  {
    statFile = readFileStat,
    hashFile = hashFileStream
  }: StableIdentityOptions = {}
): Promise<FileContentIdentity | null> {
  const before = await statFile(absolutePath);
  const digest = await hashFile(absolutePath);
  const after = await statFile(absolutePath);

  if (before.size !== after.size || before.modifiedAt !== after.modifiedAt) {
    return null;
  }

  return {
    algorithm: "sha256",
    digest,
    sizeBytes: after.size,
    modifiedAt: after.modifiedAt
  };
}

async function readFileStat(absolutePath: string): Promise<FileStatSnapshot> {
  const result = await stat(absolutePath);
  if (!result.isFile()) throw new Error("File identity target must be a regular file");
  return { size: result.size, modifiedAt: result.mtime.toISOString() };
}

function hashFileStream(absolutePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(absolutePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
