import { mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createThumbnailCache,
  createThumbnailCacheKey
} from "../../electron/services/thumbnailCache";
import type { ThumbnailSignature } from "../../src/shared/types";

let cacheDirectory: string;

beforeEach(async () => {
  cacheDirectory = path.join(os.tmpdir(), `thumbnail-cache-${crypto.randomUUID()}`);
  await mkdir(cacheDirectory, { recursive: true });
});

afterEach(async () => {
  await rm(cacheDirectory, { recursive: true, force: true });
});

describe("thumbnailCache", () => {
  it("changes keys when a model signature or renderer version changes", () => {
    expect(createThumbnailCacheKey(model({ sizeBytes: 10 }), 1)).not.toBe(
      createThumbnailCacheKey(model({ sizeBytes: 11 }), 1)
    );
    expect(createThumbnailCacheKey(model(), 1)).not.toBe(
      createThumbnailCacheKey(model(), 2)
    );
  });

  it("writes and reads supported images atomically", async () => {
    const cache = createThumbnailCache({ cacheDirectory });
    const signature = model();
    const dataUrl = `data:image/webp;base64,${Buffer.from("RIFF0000WEBP").toString("base64")}`;

    await cache.write(signature, dataUrl);

    await expect(cache.read(signature)).resolves.toBe(dataUrl);
    expect((await stat(cacheDirectory)).isDirectory()).toBe(true);
  });

  it("rejects unsupported or oversized data URLs", async () => {
    const cache = createThumbnailCache({ cacheDirectory, maxImageBytes: 3 });

    await expect(cache.write(model(), "data:text/plain;base64,AQID")).rejects.toThrow(
      "Unsupported thumbnail image"
    );
    await expect(cache.write(model(), "data:image/png;base64,AQIDBA==")).rejects.toThrow(
      "Thumbnail image is too large"
    );
  });

  it("ignores corrupt cache files and prunes expired entries", async () => {
    const signature = model();
    const cache = createThumbnailCache({ cacheDirectory, maxAgeMs: 100 });
    const key = createThumbnailCacheKey(signature, 1);
    const cachePath = path.join(cacheDirectory, `${key}.webp`);
    await writeFile(cachePath, "not-an-image");
    const oldDate = new Date(Date.now() - 1_000);
    await utimes(cachePath, oldDate, oldDate);

    await expect(cache.read(signature)).resolves.toBeNull();
    await cache.prune();
    await expect(stat(cachePath)).rejects.toThrow();
  });
});

function model(overrides: Partial<ThumbnailSignature> = {}): ThumbnailSignature {
  return {
    absolutePath: "C:\\Models\\part.stl",
    sizeBytes: 10,
    modifiedAt: "2026-09-09T00:00:00.000Z",
    ...overrides
  };
}
