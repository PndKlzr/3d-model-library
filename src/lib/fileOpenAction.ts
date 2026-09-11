import {
  canSendToSlicer,
  isArchive,
  isDirectImage,
  type SupportedFileExtension
} from "../shared/fileCapabilities";

export type DefaultFileOpenAction = "slicer" | "windows" | "inspect-archive" | "preview";

export function getDefaultFileOpenAction(
  extension: SupportedFileExtension
): DefaultFileOpenAction {
  if (isDirectImage(extension)) return "windows";
  if (isArchive(extension)) return "inspect-archive";
  if (canSendToSlicer(extension)) return "slicer";
  return "preview";
}
