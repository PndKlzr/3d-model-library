import { convertThreeMfToStl } from "../lib/threeMfToStl";

type ConversionRequest = {
  buffer: ArrayBuffer;
};

self.onmessage = (event: MessageEvent<ConversionRequest>) => {
  try {
    const stlContent = convertThreeMfToStl(event.data.buffer, (progress) => {
      self.postMessage({ type: "progress", progress });
    });

    self.postMessage({ type: "complete", stlContent });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Nao foi possivel converter o arquivo."
    });
  }
};

export {};
