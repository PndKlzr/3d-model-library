export const SUPPORTED_FILE_EXTENSIONS = [
  ".stl", ".3mf", ".obj",
  ".png", ".jpg", ".jpeg", ".webp",
  ".zip", ".rar", ".7z"
] as const;

export type SupportedFileExtension = typeof SUPPORTED_FILE_EXTENSIONS[number];
export type LibraryFileCategory = "model" | "image" | "archive";

const FILE_CATEGORY_BY_EXTENSION: Record<SupportedFileExtension, LibraryFileCategory> = {
  ".stl": "model",
  ".3mf": "model",
  ".obj": "model",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".zip": "archive",
  ".rar": "archive",
  ".7z": "archive"
};

export function getFileCategory(extension: SupportedFileExtension): LibraryFileCategory {
  return FILE_CATEGORY_BY_EXTENSION[extension];
}

export function is3dPreviewable(extension: SupportedFileExtension): boolean {
  return getFileCategory(extension) === "model";
}

export function isDirectImage(extension: SupportedFileExtension): boolean {
  return getFileCategory(extension) === "image";
}

export function isArchive(extension: SupportedFileExtension): boolean {
  return getFileCategory(extension) === "archive";
}

export function canSendToSlicer(
  extension: SupportedFileExtension
): extension is ".stl" | ".3mf" {
  return extension === ".stl" || extension === ".3mf";
}

export function canConvertToStl(extension: SupportedFileExtension): boolean {
  return extension === ".3mf";
}

export function canInspectArchive(extension: SupportedFileExtension): boolean {
  return isArchive(extension);
}

export function canOpenWithWindows(extension: SupportedFileExtension): boolean {
  return isDirectImage(extension);
}

export function canShowThumbnail(extension: SupportedFileExtension): boolean {
  return is3dPreviewable(extension) || isDirectImage(extension);
}

export function isGeometryOnlyPreview(extension: SupportedFileExtension): boolean {
  return extension === ".obj";
}

export function toSupportedFileExtension(value: string): SupportedFileExtension | null {
  const normalized = value.toLowerCase();
  return SUPPORTED_FILE_EXTENSIONS.includes(normalized as SupportedFileExtension)
    ? normalized as SupportedFileExtension
    : null;
}
