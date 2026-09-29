import {
  canSendToSlicer,
  canInspectArchive,
  canOpenWithWindows,
  type SupportedFileExtension
} from "../shared/fileCapabilities";

export type DefaultFileOpenAction = "slicer" | "windows" | "inspect-archive" | "preview";

export function getDefaultFileOpenAction(
  extension: SupportedFileExtension
): DefaultFileOpenAction {
  if (canOpenWithWindows(extension)) return "windows";
  if (canInspectArchive(extension)) return "inspect-archive";
  if (canSendToSlicer(extension)) return "slicer";
  return "preview";
}
