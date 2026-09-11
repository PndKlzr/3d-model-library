import { open, realpath, type FileHandle } from "node:fs/promises";
import path from "node:path";
import {
  SUPPORTED_FILE_EXTENSIONS,
  isDirectImage,
  type SupportedFileExtension
} from "../../src/shared/fileCapabilities.js";
import type { LibrarySessionRef } from "../../src/shared/types.js";
import { isPathInside } from "./pathContainment.js";

export const MAX_DIRECT_IMAGE_BYTES = 40 * 1024 * 1024;

type ImageFileHandle = Pick<FileHandle, "stat" | "read" | "close">;

type ImageFileSystem = {
  realpath: (value: string) => Promise<string>;
  open: (value: string, flags: "r") => Promise<ImageFileHandle>;
};

export type LibraryImageAccess = {
  getCurrentSession: () => LibrarySessionRef | null;
  decodeImage: (bytes: Uint8Array) => boolean;
  openPath: (value: string) => Promise<string>;
  fileSystem?: ImageFileSystem;
};

const defaultFileSystem: ImageFileSystem = { realpath, open };

const IMAGE_MIME_BY_EXTENSION: Partial<Record<SupportedFileExtension, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

export async function readLibraryImageDataUrl(
  expectedSession: LibrarySessionRef,
  absolutePath: string,
  access: LibraryImageAccess
): Promise<string> {
  assertCurrentSession(expectedSession, access.getCurrentSession());
  const fileSystem = access.fileSystem ?? defaultFileSystem;
  const image = await resolveLibraryImage(expectedSession.rootPath, absolutePath, fileSystem);
  const handle = await fileSystem.open(image.path, "r");
  let bytes: Buffer;

  try {
    const before = await handle.stat();
    assertReadableImageStat(before);
    bytes = Buffer.allocUnsafe(before.size);

    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!Number.isInteger(result.bytesRead) || result.bytesRead <= 0) {
        throw new Error("A imagem foi alterada durante a leitura.");
      }
      offset += result.bytesRead;
    }

    const after = await handle.stat();
    if (!after.isFile() || after.size !== before.size || offset !== before.size) {
      throw new Error("A imagem foi alterada durante a leitura.");
    }

    if (!matchesImageExtension(image.extension, bytes)) {
      throw new Error("O formato real da imagem não corresponde à extensão do arquivo.");
    }

    if (!access.decodeImage(bytes)) {
      throw new Error("A imagem está corrompida ou não pôde ser decodificada.");
    }
  } finally {
    await handle.close();
  }

  const dataUrl = `data:${image.mime};base64,${bytes.toString("base64")}`;
  assertCurrentSession(expectedSession, access.getCurrentSession());
  return dataUrl;
}

export async function openLibraryImage(
  expectedSession: LibrarySessionRef,
  absolutePath: string,
  access: LibraryImageAccess
): Promise<void> {
  assertCurrentSession(expectedSession, access.getCurrentSession());
  const fileSystem = access.fileSystem ?? defaultFileSystem;
  const image = await resolveLibraryImage(expectedSession.rootPath, absolutePath, fileSystem);
  const handle = await fileSystem.open(image.path, "r");

  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) throw new Error("O caminho não aponta para um arquivo de imagem.");
  } finally {
    await handle.close();
  }

  const currentCanonicalPath = await fileSystem.realpath(image.path);
  const canonicalRoot = await fileSystem.realpath(expectedSession.rootPath);
  if (normalizePath(currentCanonicalPath) !== normalizePath(image.path) ||
      !isPathInside(canonicalRoot, currentCanonicalPath)) {
    throw new Error("A imagem foi alterada antes de ser aberta.");
  }

  assertCurrentSession(expectedSession, access.getCurrentSession());
  const failure = await access.openPath(currentCanonicalPath);
  if (failure) throw new Error(failure);
}

async function resolveLibraryImage(
  rootPath: string,
  absolutePath: string,
  fileSystem: ImageFileSystem
) {
  if (typeof absolutePath !== "string" || !path.isAbsolute(absolutePath)) {
    throw new Error("Caminho de imagem inválido.");
  }

  const canonicalRoot = await fileSystem.realpath(rootPath);
  const canonicalPath = await fileSystem.realpath(absolutePath);
  if (!isPathInside(canonicalRoot, canonicalPath)) {
    throw new Error("A imagem está fora da biblioteca ativa.");
  }

  const extension = parseSupportedExtension(canonicalPath);
  if (!extension || !isDirectImage(extension)) {
    throw new Error("Formato de imagem não suportado.");
  }

  return {
    path: canonicalPath,
    extension,
    mime: IMAGE_MIME_BY_EXTENSION[extension]!
  };
}

function assertReadableImageStat(fileStat: { isFile: () => boolean; size: number }) {
  if (!fileStat.isFile()) throw new Error("O caminho não aponta para um arquivo de imagem.");
  if (!Number.isSafeInteger(fileStat.size) || fileStat.size < 0) {
    throw new Error("Tamanho de imagem inválido.");
  }
  if (fileStat.size > MAX_DIRECT_IMAGE_BYTES) {
    throw new Error("A imagem excede o limite de 40 MiB.");
  }
}

function assertCurrentSession(
  expected: LibrarySessionRef,
  current: LibrarySessionRef | null
) {
  if (!isLibrarySessionRef(expected) || !current ||
      expected.generation !== current.generation ||
      expected.libraryId !== current.libraryId ||
      normalizePath(expected.rootPath) !== normalizePath(current.rootPath)) {
    throw new Error("A sessão da biblioteca foi alterada.");
  }
}

function isLibrarySessionRef(value: LibrarySessionRef): boolean {
  return Boolean(value) && Number.isInteger(value.generation) &&
    typeof value.libraryId === "string" && value.libraryId.length > 0 &&
    typeof value.rootPath === "string" && path.isAbsolute(value.rootPath);
}

function normalizePath(value: string): string {
  return path.resolve(value).replaceAll("/", "\\").toLowerCase();
}

function matchesImageExtension(
  extension: SupportedFileExtension,
  bytes: Uint8Array
): boolean {
  if (extension === ".png") {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return startsWith(bytes, [0xff, 0xd8, 0xff]);
  }
  if (extension === ".webp") {
    return bytes.length >= 12 &&
      startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
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
