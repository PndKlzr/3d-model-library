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
  | { type: "unavailable"; id: number }
  | { type: "error"; id: number; message: string };

export async function executeThumbnailWorkerRequest(
  request: ThumbnailWorkerRenderRequest,
  renderer: THREE.WebGLRenderer,
  canvas: OffscreenCanvas,
  drawScene: typeof renderThumbnailScene = renderThumbnailScene
): Promise<ThumbnailWorkerRenderResponse> {
  if (isContextLost(renderer)) return { type: "unavailable", id: request.id };
  try {
    drawScene(renderer, request.extension, request.bytes);
  } catch (error) {
    if (isContextLost(renderer)) return { type: "unavailable", id: request.id };
    return {
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : "Thumbnail rendering failed"
    };
  }

  if (isContextLost(renderer)) return { type: "unavailable", id: request.id };
  try {
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.78 });
    if (isContextLost(renderer)) return { type: "unavailable", id: request.id };
    if (!blob.size || !["image/webp", "image/png", "image/jpeg"].includes(blob.type)) {
      throw new Error("Thumbnail encoding failed");
    }
    const bytes = await blob.arrayBuffer();
    if (isContextLost(renderer)) return { type: "unavailable", id: request.id };
    return {
      type: "result",
      id: request.id,
      mime: blob.type,
      bytes
    };
  } catch (error) {
    return { type: "unavailable", id: request.id };
  }
}

function isContextLost(renderer: THREE.WebGLRenderer): boolean {
  try {
    return renderer.getContext?.()?.isContextLost?.() ?? false;
  } catch {
    return true;
  }
}
