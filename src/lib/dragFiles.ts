import type { ModelFile } from "../shared/types";

const PRINTABLE_DRAG_EXTENSIONS = new Set<ModelFile["extension"]>([".stl", ".3mf"]);

export function getDragOutFilePaths(
  draggedModel: ModelFile,
  visibleModels: ModelFile[],
  selectedModelIds: Set<string>
): string[] {
  const dragModels = selectedModelIds.has(draggedModel.id)
    ? visibleModels.filter((model) => selectedModelIds.has(model.id))
    : [draggedModel];

  return dragModels
    .filter((model) => PRINTABLE_DRAG_EXTENSIONS.has(model.extension))
    .map((model) => model.absolutePath);
}
