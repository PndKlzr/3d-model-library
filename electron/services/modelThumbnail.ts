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

  const files = unzipSync(new Uint8Array(await readFile(filePath)));
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

function findThumbnailPath(paths: string[]): string | null {
  const imagePaths = paths.filter((filePath) => {
    const normalized = filePath.toLowerCase();
    return (
      normalized.includes("thumbnail") &&
      Boolean(IMAGE_MIME_BY_EXTENSION[path.extname(normalized)])
    );
  });

  return (
    imagePaths.find((filePath) => filePath.toLowerCase().includes("thumbnail_3mf")) ??
    imagePaths.find((filePath) => filePath.toLowerCase().includes("thumbnail_middle")) ??
    imagePaths.find((filePath) => filePath.toLowerCase().includes("thumbnail_small")) ??
    imagePaths[0] ??
    null
  );
}
