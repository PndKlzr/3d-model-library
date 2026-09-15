import type * as THREE from "three";
import type { ModelFile } from "../shared/types";
import { renderThumbnailScene } from "./thumbnailRenderer";

export type ThumbnailWorkerRenderRequest = {
  id: number;
  extension: ModelFile["extension"];
  bytes: ArrayBuffer;
};

export type ThumbnailWorkerRenderResponse =
  | { type: "result"; id: number; mime: string; bytes: ArrayBuffer }
  | { type: "error"; id: number; message: string };

export async function executeThumbnailWorkerRequest(
  request: ThumbnailWorkerRenderRequest,
  renderer: THREE.WebGLRenderer,
  canvas: OffscreenCanvas,
  drawScene: typeof renderThumbnailScene = renderThumbnailScene
): Promise<ThumbnailWorkerRenderResponse> {
  try {
    drawScene(renderer, request.extension, request.bytes);
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.78 });
    if (!blob.size || !["image/webp", "image/png", "image/jpeg"].includes(blob.type)) {
      throw new Error("Thumbnail encoding failed");
    }
    return {
      type: "result",
      id: request.id,
      mime: blob.type,
      bytes: await blob.arrayBuffer()
    };
  } catch (error) {
    return {
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : "Thumbnail rendering failed"
    };
  }
}
