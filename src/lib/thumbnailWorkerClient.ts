import type { ModelFile } from "../shared/types";

type WorkerTransport = Pick<Worker, "onmessage" | "onerror" | "postMessage" | "terminate">;

type WorkerMessage =
  | { type: "ready"; supported: boolean }
  | { type: "result"; id: number; mime: string; bytes: ArrayBuffer }
  | { type: "error"; id: number; message: string };

const STARTUP_TIMEOUT_MS = 5_000;
const JOB_TIMEOUT_MS = 15_000;
const MAX_THUMBNAIL_BYTES = 8 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/webp", "image/png", "image/jpeg"]);

export function createThumbnailWorkerClient(
  factory: () => WorkerTransport = () => new Worker(
    new URL("../workers/thumbnail.worker.ts", import.meta.url),
    { type: "module" }
  )
) {
  let worker: WorkerTransport | null = null;
  let ready = false;
  let unavailable = false;
  let startup: Promise<boolean> | null = null;
  let settleStartup: ((supported: boolean) => void) | null = null;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let nextId = 0;
  let pending: {
    id: number;
    timer: ReturnType<typeof setTimeout>;
    resolve: (value: string | null) => void;
    reject: (error: Error) => void;
  } | null = null;

  function terminateWorker() {
    worker?.terminate();
    worker = null;
    ready = false;
    startup = null;
  }

  function disable() {
    unavailable = true;
    if (startupTimer) clearTimeout(startupTimer);
    startupTimer = null;
    settleStartup?.(false);
    settleStartup = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve(null);
      pending = null;
    }
    terminateWorker();
  }

  function handleMessage(message: WorkerMessage) {
    if (message.type === "ready") {
      if (!message.supported) {
        disable();
        return;
      }
      if (startupTimer) clearTimeout(startupTimer);
      startupTimer = null;
      ready = true;
      settleStartup?.(true);
      settleStartup = null;
      return;
    }
    if (!pending || message.id !== pending.id) return;
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
    if (message.type === "error") {
      current.reject(new Error(message.message));
      return;
    }
    if (!IMAGE_MIMES.has(message.mime) || !(message.bytes instanceof ArrayBuffer) ||
        message.bytes.byteLength === 0 || message.bytes.byteLength > MAX_THUMBNAIL_BYTES) {
      current.resolve(null);
      disable();
      return;
    }
    current.resolve(`data:${message.mime};base64,${encodeBase64(message.bytes)}`);
  }

  function ensureReady(): Promise<boolean> {
    if (unavailable) return Promise.resolve(false);
    if (ready && worker) return Promise.resolve(true);
    if (startup) return startup;

    startup = new Promise<boolean>((resolve) => {
      settleStartup = resolve;
      try {
        worker = factory();
        worker.onmessage = (event) => handleMessage(event.data as WorkerMessage);
        worker.onerror = () => disable();
        startupTimer = setTimeout(disable, STARTUP_TIMEOUT_MS);
      } catch {
        disable();
      }
    });
    return startup;
  }

  async function render(
    extension: ModelFile["extension"],
    bytes: ArrayBuffer
  ): Promise<string | null> {
    if (!(await ensureReady())) return null;
    if (pending) throw new Error("Thumbnail worker is already busy");

    return new Promise<string | null>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending = null;
        terminateWorker();
        reject(new Error("Thumbnail worker timed out"));
      }, JOB_TIMEOUT_MS);
      pending = { id, timer, resolve, reject };
      try {
        worker!.postMessage({ type: "render", id, extension, bytes });
      } catch {
        disable();
      }
    });
  }

  return { render };
}

function encodeBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let offset = 0; offset < view.length; offset += 8192) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export const thumbnailWorkerClient = createThumbnailWorkerClient();
