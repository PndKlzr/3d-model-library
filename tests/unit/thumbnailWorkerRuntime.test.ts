import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { executeThumbnailWorkerRequest } from "../../src/lib/thumbnailWorkerRuntime";

describe("thumbnailWorkerRuntime", () => {
  it("exports a scene as transferable WebP bytes", async () => {
    const draw = vi.fn();
    const convertToBlob = vi.fn(async () => new Blob(["RIFF0000WEBP"], { type: "image/webp" }));
    const canvas = { convertToBlob } as unknown as OffscreenCanvas;
    const renderer = {} as THREE.WebGLRenderer;
    const modelBytes = new ArrayBuffer(8);

    const result = await executeThumbnailWorkerRequest(
      { id: 7, extension: ".3mf", bytes: modelBytes },
      renderer,
      canvas,
      draw
    );

    expect(draw).toHaveBeenCalledWith(renderer, ".3mf", modelBytes);
    expect(convertToBlob).toHaveBeenCalledWith({ type: "image/webp", quality: 0.78 });
    expect(result).toMatchObject({ type: "result", id: 7, mime: "image/webp" });
    if (result.type !== "result") throw new Error("expected a result");
    expect(new TextDecoder().decode(result.bytes)).toBe("RIFF0000WEBP");
  });

  it("returns an error for a damaged model without changing the Worker transport", async () => {
    const result = await executeThumbnailWorkerRequest(
      { id: 8, extension: ".obj", bytes: new ArrayBuffer(4) },
      {} as THREE.WebGLRenderer,
      {} as OffscreenCanvas,
      () => { throw new Error("invalid OBJ"); }
    );

    expect(result).toEqual({ type: "error", id: 8, message: "invalid OBJ" });
  });

  it("treats image export failure as Worker unavailability, not a bad model", async () => {
    const canvas = {
      convertToBlob: async () => { throw new Error("GPU export failed"); }
    } as unknown as OffscreenCanvas;
    const result = await executeThumbnailWorkerRequest(
      { id: 9, extension: ".stl", bytes: new ArrayBuffer(4) },
      {} as THREE.WebGLRenderer,
      canvas,
      () => undefined
    );

    expect(result).toEqual({ type: "unavailable", id: 9 });
  });

  it("never exports a stale image after the WebGL context is lost", async () => {
    let lost = false;
    const renderer = {
      getContext: () => ({ isContextLost: () => lost })
    } as unknown as THREE.WebGLRenderer;
    const convertToBlob = vi.fn(async () => new Blob(["RIFF0000WEBP"], { type: "image/webp" }));
    const canvas = { convertToBlob } as unknown as OffscreenCanvas;
    const result = await executeThumbnailWorkerRequest(
      { id: 10, extension: ".stl", bytes: new ArrayBuffer(4) },
      renderer,
      canvas,
      () => { lost = true; }
    );

    expect(result).toEqual({ type: "unavailable", id: 10 });
    expect(convertToBlob).not.toHaveBeenCalled();
  });
});
