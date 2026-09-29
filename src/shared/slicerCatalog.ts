import type { SlicerConfig } from "./types.js";

export type BuiltInSlicerKey =
  | "cura"
  | "creality-print"
  | "orca-slicer"
  | "prusa-slicer"
  | "bambu-studio"
  | "anycubic-slicer-next"
  | "ideamaker"
  | "elegoo-satellite";

export type BuiltInSlicerDefinition = {
  key: BuiltInSlicerKey;
  id: string;
  name: string;
  aliases: readonly string[];
  executableNames: readonly string[];
};

export const BUILT_IN_SLICERS: readonly BuiltInSlicerDefinition[] = [
  {
    key: "cura",
    id: "cura",
    name: "UltiMaker Cura",
    aliases: ["ultimaker cura", "cura"],
    executableNames: ["UltiMaker-Cura.exe", "Cura.exe"]
  },
  {
    key: "creality-print",
    id: "creality-print",
    name: "Creality Print",
    aliases: ["creality print"],
    executableNames: ["CrealityPrint.exe", "Creality Print.exe"]
  },
  {
    key: "orca-slicer",
    id: "orca-slicer",
    name: "OrcaSlicer",
    aliases: ["orcaslicer", "orca slicer"],
    executableNames: ["orca-slicer.exe", "OrcaSlicer.exe"]
  },
  {
    key: "prusa-slicer",
    id: "prusa-slicer",
    name: "PrusaSlicer",
    aliases: ["prusaslicer", "prusa slicer"],
    executableNames: ["prusa-slicer.exe", "PrusaSlicer.exe"]
  },
  {
    key: "bambu-studio",
    id: "bambu-studio",
    name: "Bambu Studio",
    aliases: ["bambu studio"],
    executableNames: ["bambu-studio.exe", "BambuStudio.exe"]
  },
  {
    key: "anycubic-slicer-next",
    id: "anycubic-slicer-next",
    name: "Anycubic Slicer Next",
    aliases: ["anycubic slicer next", "anycubic slicernext"],
    executableNames: ["AnycubicSlicerNext.exe", "Anycubic Slicer Next.exe"]
  },
  {
    key: "ideamaker",
    id: "ideamaker",
    name: "ideaMaker",
    aliases: ["ideamaker", "raise3d ideamaker"],
    executableNames: ["ideaMaker.exe"]
  },
  {
    key: "elegoo-satellite",
    id: "elegoo-satellite",
    name: "ELEGOO SatelLite",
    aliases: ["elegoo satellite", "elegoo satellite slicer"],
    executableNames: ["ELEGOO SatelLite.exe", "SatelLite.exe"]
  }
] as const;

export function createBuiltInSlicerConfigs(): SlicerConfig[] {
  return BUILT_IN_SLICERS.map((definition) => ({
    id: definition.id,
    name: definition.name,
    kind: "built-in",
    builtInKey: definition.key,
    executablePath: "",
    enabled: false,
    pathSource: null
  }));
}

export function normalizeSlicerConfigs(slicers: readonly Partial<SlicerConfig>[] = []): SlicerConfig[] {
  const existingByBuiltInKey = new Map<BuiltInSlicerKey, Partial<SlicerConfig>>();
  const custom: SlicerConfig[] = [];

  for (const slicer of slicers) {
    const definition = BUILT_IN_SLICERS.find((candidate) =>
      candidate.key === slicer.builtInKey || candidate.id === slicer.id
    );
    if (definition) {
      existingByBuiltInKey.set(definition.key, slicer);
      continue;
    }

    if (!slicer.id || !slicer.name) continue;
    const executablePath = slicer.executablePath ?? "";
    custom.push({
      id: slicer.id,
      name: slicer.name,
      kind: "custom",
      executablePath,
      enabled: slicer.enabled === true,
      pathSource: slicer.pathSource ?? (executablePath ? "manual" : null)
    });
  }

  const builtIns = BUILT_IN_SLICERS.map((definition): SlicerConfig => {
    const existing = existingByBuiltInKey.get(definition.key);
    const executablePath = existing?.executablePath ?? "";
    return {
      id: definition.id,
      name: existing?.name ?? definition.name,
      kind: "built-in",
      builtInKey: definition.key,
      executablePath,
      enabled: existing?.enabled === true,
      pathSource: existing?.pathSource ?? (executablePath ? "manual" : null)
    };
  });

  return [...builtIns, ...custom];
}
