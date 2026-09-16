import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeStableFileIdentity,
  createFileIdentityService
} from "../../electron/services/fileIdentityService";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("fileIdentityService", () => {
  it("computes a stable streamed SHA-256 identity", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "model-identity-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "part.stl");
    const contents = Buffer.from("solid part\nendsolid part\n");
    await writeFile(filePath, contents);

    const identity = await computeStableFileIdentity(filePath);

    expect(identity).toMatchObject({
      algorithm: "sha256",
      digest: createHash("sha256").update(contents).digest("hex"),
      sizeBytes: contents.length
    });
    expect(Number.isNaN(Date.parse(identity!.modifiedAt))).toBe(false);
  });

  it("discards an identity when the file changes while hashing", async () => {
    const statFile = vi.fn()
      .mockResolvedValueOnce({ size: 10, modifiedAt: "2026-09-16T10:00:00.000Z" })
      .mockResolvedValueOnce({ size: 11, modifiedAt: "2026-09-16T10:00:01.000Z" });

    const identity = await computeStableFileIdentity("C:/library/part.stl", {
      statFile,
      hashFile: async () => "c".repeat(64)
    });

    expect(identity).toBeNull();
  });

  it("runs identity jobs one at a time", async () => {
    let running = 0;
    let maximumRunning = 0;
    const service = createFileIdentityService({
      computeIdentity: async (filePath) => {
        running += 1;
        maximumRunning = Math.max(maximumRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return {
          algorithm: "sha256",
          digest: filePath.endsWith("a.stl") ? "a".repeat(64) : "b".repeat(64),
          sizeBytes: 1,
          modifiedAt: "2026-09-16T10:00:00.000Z"
        };
      }
    });

    await Promise.all([
      service.identify("C:/library/a.stl"),
      service.identify("C:/library/b.stl")
    ]);

    expect(maximumRunning).toBe(1);
  });
});
