import {
  getFileCategory,
  type SupportedFileExtension
} from "../shared/fileCapabilities";

export type DefaultFileOpenAction = "slicer" | "windows" | "inspect-archive";

export function getDefaultFileOpenAction(
  extension: SupportedFileExtension
): DefaultFileOpenAction {
  const category = getFileCategory(extension);
  if (category === "image") return "windows";
  if (category === "archive") return "inspect-archive";
  return "slicer";
}
