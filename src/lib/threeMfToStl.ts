import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { parseThreeMfPreview } from "./threeMfPreview";

export function convertThreeMfToStl(
  buffer: ArrayBuffer,
  onProgress?: (progress: number) => void
): string {
  onProgress?.(10);
  const group = parseThreeMfPreview(buffer, { center: false });
  onProgress?.(70);
  const stl = new STLExporter().parse(group, { binary: false }) as string;
  onProgress?.(100);
  return stl;
}
