import type { AppSettings } from "../shared/types";

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
    defaultSlicerId: current.defaultSlicerId ?? slicerId,
    slicers: current.slicers.map((slicer) =>
      slicer.id === slicerId
        ? { ...slicer, executablePath, enabled: true }
        : slicer
    )
  });
}
