import { describe, expect, it } from "vitest";
import {
  BUILT_IN_SLICERS,
  createBuiltInSlicerConfigs
} from "../../src/shared/slicerCatalog";

describe("slicer catalog", () => {
  it("defines the eight supported FDM slicers with stable unique ids", () => {
    expect(BUILT_IN_SLICERS.map(({ key }) => key)).toEqual([
      "cura",
      "creality-print",
      "orca-slicer",
      "prusa-slicer",
      "bambu-studio",
      "anycubic-slicer-next",
      "ideamaker",
      "elegoo-satellite"
    ]);
    expect(new Set(BUILT_IN_SLICERS.map(({ id }) => id)).size).toBe(8);
    expect(BUILT_IN_SLICERS.every(({ aliases, executableNames }) =>
      aliases.length > 0 && executableNames.every((name) => name.toLowerCase().endsWith(".exe"))
    )).toBe(true);
  });

  it("creates disabled unconfigured settings for every built-in slicer", () => {
    expect(createBuiltInSlicerConfigs()).toHaveLength(8);
    expect(createBuiltInSlicerConfigs()[2]).toMatchObject({
      id: "orca-slicer",
      name: "OrcaSlicer",
      kind: "built-in",
      builtInKey: "orca-slicer",
      executablePath: "",
      enabled: false,
      pathSource: null
    });
  });
});
