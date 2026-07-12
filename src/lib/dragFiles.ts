import type { ModelFile } from "../shared/types";

const EXTERNAL_DRAG_EXTENSIONS = new Set<ModelFile["extension"]>([
  ".stl",
  ".3mf",
  ".zip",
  ".rar",
  ".7z"
]);

export function getDragOutFilePaths(
  draggedModel: ModelFile,
  visibleModels: ModelFile[],
  selectedModelIds: Set<string>
): string[] {
  const dragModels = selectedModelIds.has(draggedModel.id)
    ? visibleModels.filter((model) => selectedModelIds.has(model.id))
    : [draggedModel];

  const uniquePaths = new Map<string, string>();

  for (const model of dragModels) {
    if (!EXTERNAL_DRAG_EXTENSIONS.has(model.extension)) {
      continue;
    }

    const comparisonPath = model.absolutePath.toLocaleLowerCase("en-US");

    if (!uniquePaths.has(comparisonPath)) {
      uniquePaths.set(comparisonPath, model.absolutePath);
    }
  }

  return [...uniquePaths.values()];
}

export function getDragModelIds(
  draggedModel: ModelFile,
  libraryModels: ModelFile[],
  selectedModelIds: Set<string>
): string[] {
  return selectedModelIds.has(draggedModel.id)
    ? libraryModels.filter((model) => selectedModelIds.has(model.id)).map((model) => model.id)
    : [draggedModel.id];
}
