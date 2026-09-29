import { canSendToSlicer } from "../shared/fileCapabilities";
import type { ModelFile } from "../shared/types";

export function getSlicerLaunchFilePaths(
  contextFile: ModelFile,
  libraryFiles: readonly ModelFile[],
  selectedFileIds: ReadonlySet<string>
): string[] {
  const selectedFiles = libraryFiles.filter(
    (file) => selectedFileIds.has(file.id) && canSendToSlicer(file.extension)
  );

  if (selectedFileIds.has(contextFile.id) && selectedFiles.length > 0) {
    return selectedFiles.map((file) => file.absolutePath);
  }

  return canSendToSlicer(contextFile.extension) ? [contextFile.absolutePath] : [];
}
