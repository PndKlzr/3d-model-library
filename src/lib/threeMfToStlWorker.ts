type ConversionWorkerMessage =
  | { type: "progress"; progress: number }
  | { type: "complete"; stlContent: string }
  | { type: "error"; message: string };

export function convertThreeMfToStlInWorker(
  buffer: ArrayBuffer,
  onProgress: (progress: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/threeMfToStl.worker.ts", import.meta.url), {
      type: "module"
    });
    let isFinished = false;

    const finish = (callback: () => void) => {
      if (isFinished) {
        return;
      }

      isFinished = true;
      worker.terminate();
      callback();
    };

    worker.onmessage = (event: MessageEvent<ConversionWorkerMessage>) => {
      const message = event.data;

      if (message.type === "progress") {
        onProgress(message.progress);
        return;
      }

      if (message.type === "complete") {
        finish(() => resolve(message.stlContent));
        return;
      }

      finish(() => reject(new Error(message.message)));
    };

    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || "Falha ao iniciar a conversao.")));
    };

    worker.postMessage({ buffer }, [buffer]);
  });
}
