import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

export async function readEmbeddedThumbnail(filePath: string): Promise<string | null> {
  if (path.extname(filePath).toLowerCase() !== ".3mf") {
    return null;
  }

  const files = safeUnzip(new Uint8Array(await readFile(filePath)));

  if (!files) {
    return null;
  }

  const thumbnailPath = findThumbnailPath(Object.keys(files));

  if (!thumbnailPath) {
    return null;
  }

  const extension = path.extname(thumbnailPath).toLowerCase();
  const mime = IMAGE_MIME_BY_EXTENSION[extension];

  if (!mime) {
    return null;
  }

  return `data:${mime};base64,${Buffer.from(files[thumbnailPath]).toString("base64")}`;
}

function safeUnzip(data: Uint8Array): Record<string, Uint8Array> | null {
  try {
    return unzipSync(data);
  } catch {
    return null;
  }
}

function findThumbnailPath(paths: string[]): string | null {
  const imagePaths = paths.filter((filePath) => {
    const normalized = filePath.toLowerCase();
    return Boolean(IMAGE_MIME_BY_EXTENSION[path.extname(normalized)]);
  });

  return (
    imagePaths.find((filePath) => filePath.toLowerCase().includes("thumbnail_3mf")) ??
    imagePaths.find((filePath) => filePath.toLowerCase().includes("thumbnail_middle")) ??
    imagePaths.find((filePath) => filePath.toLowerCase().includes("thumbnail_small")) ??
    imagePaths.find((filePath) => filePath.toLowerCase().includes("thumbnail")) ??
    imagePaths.find((filePath) => filePath.toLowerCase().includes("metadata/plate_1_small")) ??
    imagePaths.find((filePath) => filePath.toLowerCase().includes("metadata/plate_1")) ??
    imagePaths.find((filePath) => filePath.toLowerCase().includes("metadata/pick_1")) ??
    imagePaths.find((filePath) => filePath.toLowerCase().includes("metadata/top_1")) ??
    imagePaths.find((filePath) => filePath.toLowerCase().startsWith("metadata/")) ??
    imagePaths[0] ??
    null
  );
}
