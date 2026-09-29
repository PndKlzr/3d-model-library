import * as THREE from "three";
import {
  executeThumbnailWorkerRequest,
  type ThumbnailWorkerRenderRequest
} from "../lib/thumbnailWorkerRuntime";

try {
  const canvas = new OffscreenCanvas(260, 180);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(1);
  renderer.setSize(260, 180, false);
  renderer.setClearColor("#edf2f3", 1);

  self.onmessage = async (event: MessageEvent<ThumbnailWorkerRenderRequest & { type: string }>) => {
    if (event.data.type !== "render") return;
    const response = await executeThumbnailWorkerRequest(event.data, renderer, canvas);
    if (response.type === "result") {
      self.postMessage(response, [response.bytes]);
    } else {
      self.postMessage(response);
    }
  };
  self.postMessage({ type: "ready", supported: true });
} catch {
  self.postMessage({ type: "ready", supported: false });
}

export {};
