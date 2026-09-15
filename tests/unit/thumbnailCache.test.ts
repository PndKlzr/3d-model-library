import { mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createThumbnailCache,
  createThumbnailCacheKey,
  THUMBNAIL_RENDER_VERSION
} from "../../electron/services/thumbnailCache";
import type { ThumbnailSignature } from "../../src/shared/types";

let cacheDirectory: string;

beforeEach(async () => {
  cacheDirectory = path.join(os.tmpdir(), `thumbnail-cache-${crypto.randomUUID()}`);
  await mkdir(cacheDirectory, { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(cacheDirectory, { recursive: true, force: true });
});

describe("thumbnailCache", () => {
  it("invalidates only the requested cached thumbnail even with a valid-looking damaged image", async () => {
    const cache = createThumbnailCache({ cacheDirectory });
    const target = model();
    const other = model({ absolutePath: "C:\\Models\\other.stl" });
    const damaged = `data:image/webp;base64,${Buffer.from("RIFFjunkWEBP").toString("base64")}`;
    await cache.write(target, damaged);
    await cache.write(other, damaged);
    await expect(cache.read(target)).resolves.toBe(damaged);

    await cache.invalidate(target);

    await expect(cache.read(target)).resolves.toBeNull();
    await expect(cache.read(other)).resolves.toBe(damaged);
  });

  it("waits for an in-flight write before invalidating its result", async () => {
    const cache = createThumbnailCache({ cacheDirectory });
    const target = model();
    const dataUrl = `data:image/webp;base64,${Buffer.from("RIFF0000WEBP").toString("base64")}`;
    const publicationStarted = deferred<void>();
    const allowPublication = deferred<void>();
    const write = cache.write(target, dataUrl, {
      key: "session-a",
      async publish(commit) {
        publicationStarted.resolve();
        await allowPublication.promise;
        await commit();
        return true;
      }
    });
    await publicationStarted.promise;
    const invalidate = cache.invalidate(target);
    allowPublication.resolve();
    await Promise.all([write, invalidate]);
    await expect(cache.read(target)).resolves.toBeNull();
  });

  it("uses the bed-orientation renderer version", () => {
    expect(THUMBNAIL_RENDER_VERSION).toBe(3);
  });

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

  it("coalesces concurrent writes for the same model signature", async () => {
    const cache = createThumbnailCache({ cacheDirectory });
    const signature = model();
    const dataUrl = `data:image/webp;base64,${Buffer.from("RIFF0000WEBP").toString("base64")}`;
    vi.spyOn(Date, "now").mockReturnValue(1234);

    await expect(Promise.all([
      cache.write(signature, dataUrl),
      cache.write(signature, dataUrl),
      cache.write(signature, dataUrl)
    ])).resolves.toEqual([undefined, undefined, undefined]);
    await expect(cache.read(signature)).resolves.toBe(dataUrl);
  });

  it("withholds a stale session write without deleting the current session entry", async () => {
    const cache = createThumbnailCache({ cacheDirectory });
    const signature = model();
    const oldDataUrl = `data:image/webp;base64,${Buffer.from("RIFFold!WEBP").toString("base64")}`;
    const newDataUrl = `data:image/webp;base64,${Buffer.from("RIFFnew!WEBP").toString("base64")}`;
    const oldPublicationStarted = deferred<void>();
    const oldPublicationReady = deferred<void>();
    let currentSession = "session-a";

    const oldWrite = cache.write(signature, oldDataUrl, {
      key: "session-a",
      async publish(commit) {
        oldPublicationStarted.resolve();
        await oldPublicationReady.promise;
        if (currentSession !== "session-a") return false;
        await commit();
        return true;
      }
    });
    await oldPublicationStarted.promise;
    currentSession = "session-b";
    await cache.write(signature, newDataUrl, {
      key: "session-b",
      async publish(commit) {
        if (currentSession !== "session-b") return false;
        await commit();
        return true;
      }
    });
    oldPublicationReady.resolve();
    await oldWrite;

    await expect(cache.read(signature)).resolves.toBe(newDataUrl);
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

  it("does not delete temporary files belonging to an active write", async () => {
    const cache = createThumbnailCache({ cacheDirectory });
    const activeTemporary = path.join(cacheDirectory, "active.tmp");
    const abandonedTemporary = path.join(cacheDirectory, "abandoned.tmp");
    await writeFile(activeTemporary, "writing");
    await writeFile(abandonedTemporary, "abandoned");
    await utimes(abandonedTemporary, new Date(Date.now() - 2 * 60 * 60 * 1000),
      new Date(Date.now() - 2 * 60 * 60 * 1000));

    await cache.prune();

    await expect(stat(activeTemporary)).resolves.toMatchObject({ size: 7 });
    await expect(stat(abandonedTemporary)).rejects.toThrow();
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
