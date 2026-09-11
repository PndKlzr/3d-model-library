import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  SUPPORTED_FILE_EXTENSIONS,
  isDirectImage,
  type SupportedFileExtension
} from "../../src/shared/fileCapabilities.js";
import { isPathInside } from "./pathContainment.js";

export const MAX_DIRECT_IMAGE_BYTES = 40 * 1024 * 1024;

type ImageFileDependencies = {
  realpath: (value: string) => Promise<string>;
  stat: (value: string) => Promise<{ isFile: () => boolean; size: number }>;
  readFile: (value: string) => Promise<Uint8Array>;
};

const defaultDependencies: ImageFileDependencies = { realpath, stat, readFile };

const IMAGE_MIME_BY_EXTENSION: Partial<Record<SupportedFileExtension, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

export async function readLibraryImageDataUrl(
  rootPath: string,
  absolutePath: string,
  dependencies: ImageFileDependencies = defaultDependencies
): Promise<string> {
  const image = await resolveLibraryImage(rootPath, absolutePath, dependencies);
  if (image.size > MAX_DIRECT_IMAGE_BYTES) {
    throw new Error("A imagem excede o limite de 40 MiB.");
  }

  const bytes = await dependencies.readFile(image.path);
  if (!hasImageSignature(image.extension, bytes)) {
    throw new Error("A imagem está corrompida ou não pôde ser reconhecida.");
  }
  return `data:${image.mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function openLibraryImage(
  rootPath: string,
  absolutePath: string,
  openPath: (value: string) => Promise<string>,
  dependencies: ImageFileDependencies = defaultDependencies
): Promise<void> {
  const image = await resolveLibraryImage(rootPath, absolutePath, dependencies);
  const failure = await openPath(image.path);
  if (failure) throw new Error(failure);
}

async function resolveLibraryImage(
  rootPath: string,
  absolutePath: string,
  dependencies: ImageFileDependencies
) {
  if (typeof absolutePath !== "string" || !path.isAbsolute(absolutePath)) {
    throw new Error("Caminho de imagem inválido.");
  }

  const canonicalRoot = await dependencies.realpath(rootPath);
  const canonicalPath = await dependencies.realpath(absolutePath);
  if (!isPathInside(canonicalRoot, canonicalPath)) {
    throw new Error("A imagem está fora da biblioteca ativa.");
  }

  const extension = parseSupportedExtension(canonicalPath);
  if (!extension || !isDirectImage(extension)) {
    throw new Error("Formato de imagem não suportado.");
  }

  const fileStat = await dependencies.stat(canonicalPath);
  if (!fileStat.isFile()) throw new Error("O caminho não aponta para um arquivo de imagem.");

  return {
    path: canonicalPath,
    size: fileStat.size,
    extension,
    mime: IMAGE_MIME_BY_EXTENSION[extension]!
  };
}

function hasImageSignature(extension: SupportedFileExtension, bytes: Uint8Array): boolean {
  if (extension === ".png") {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return startsWith(bytes, [0xff, 0xd8, 0xff]);
  }
  if (extension === ".webp") {
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes.length >= 12 &&
      startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]);
  }
  return false;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function parseSupportedExtension(absolutePath: string): SupportedFileExtension | null {
  const extension = path.extname(absolutePath).toLowerCase();
  return SUPPORTED_FILE_EXTENSIONS.includes(extension as SupportedFileExtension)
    ? extension as SupportedFileExtension
    : null;
}
