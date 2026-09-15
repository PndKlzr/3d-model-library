import type { AppSettings, SlicerCandidate } from "../shared/types";

export type AppSettingsMutation = (current: AppSettings) => AppSettings;

export function setSlicerEnabled(
  slicerId: string,
  enabled: boolean
): AppSettingsMutation {
  return (current) => ({
    ...current,
    slicers: current.slicers.map((slicer) =>
      slicer.id === slicerId ? { ...slicer, enabled } : slicer
    )
  });
}

export function setSlicerExecutable(
  slicerId: string,
  executablePath: string
): AppSettingsMutation {
  return (current) => ({
    ...current,
    slicers: current.slicers.map((slicer) =>
      slicer.id === slicerId
        ? { ...slicer, executablePath, enabled: true, pathSource: "manual" }
        : slicer
    )
  });
}

export function setDefaultSlicer(slicerId: string | null): AppSettingsMutation {
  return (current) => ({
    ...current,
    defaultSlicerId: slicerId && current.slicers.some((slicer) => slicer.id === slicerId)
      ? slicerId
      : null
  });
}

export function addCustomSlicer(name: string, executablePath: string): AppSettingsMutation {
  const id = globalThis.crypto.randomUUID();
  return (current) => ({
    ...current,
    slicers: [
      ...current.slicers,
      {
        id: `custom-${id}`,
        name: name.trim(),
        kind: "custom",
        executablePath,
        enabled: true,
        pathSource: "manual"
      }
    ]
  });
}

export function renameCustomSlicer(slicerId: string, name: string): AppSettingsMutation {
  return (current) => ({
    ...current,
    slicers: current.slicers.map((slicer) =>
      slicer.id === slicerId && slicer.kind === "custom"
        ? { ...slicer, name: name.trim() }
        : slicer
    )
  });
}

export function removeCustomSlicer(slicerId: string): AppSettingsMutation {
  return (current) => {
    const removable = current.slicers.some(
      (slicer) => slicer.id === slicerId && slicer.kind === "custom"
    );
    if (!removable) return current;

    return {
      ...current,
      defaultSlicerId: current.defaultSlicerId === slicerId ? null : current.defaultSlicerId,
      slicers: current.slicers.filter((slicer) => slicer.id !== slicerId)
    };
  };
}

export function applyDetectedSlicers(candidates: readonly SlicerCandidate[]): AppSettingsMutation {
  return (current) => ({
    ...current,
    slicers: current.slicers.map((slicer) => {
      if (slicer.kind !== "built-in" || slicer.pathSource === "manual") return slicer;
      const candidate = candidates.find((item) => item.builtInKey === slicer.builtInKey);
      return candidate
        ? { ...slicer, executablePath: candidate.executablePath, enabled: true,
            pathSource: "detected" as const }
        : slicer;
    })
  });
}
