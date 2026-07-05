import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { parseThreeMfPreview } from "./threeMfPreview";

export function convertThreeMfToStl(buffer: ArrayBuffer): string {
  const group = parseThreeMfPreview(buffer, { center: false });
  return new STLExporter().parse(group, { binary: false }) as string;
}
