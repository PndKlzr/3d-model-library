import { open, realpath, stat, type FileHandle } from "node:fs/promises";
import path from "node:path";
import type { LibrarySessionRef } from "../../src/shared/types.js";
import {
  OBJ_PREVIEW_BUDGET,
  OBJ_PREVIEW_LIMIT_ERROR
} from "../../src/shared/objPreviewBudget.js";
import { isPathInside } from "./pathContainment.js";

type ObjStat = {
  isFile: () => boolean;
  size: number;
  dev: number | bigint;
  ino: number | bigint;
  mtimeMs: number;
  ctimeMs: number;
};

type ObjFileHandle = Pick<FileHandle, "stat" | "read" | "close">;

type ObjFileSystem = {
  realpath: (value: string) => Promise<string>;
  open: (value: string, flags: "r") => Promise<ObjFileHandle>;
  stat: (value: string) => Promise<ObjStat>;
};

export type LibraryObjAccess = {
  getCurrentSession: () => LibrarySessionRef | null;
  fileSystem?: ObjFileSystem;
};

const defaultFileSystem: ObjFileSystem = { realpath, open, stat };

export async function readLibraryObjPreview(
  expectedSession: LibrarySessionRef,
  absolutePath: string,
  access: LibraryObjAccess
): Promise<ArrayBuffer> {
  assertCurrentSession(expectedSession, access.getCurrentSession());
  const fileSystem = access.fileSystem ?? defaultFileSystem;
  const canonicalRoot = await fileSystem.realpath(expectedSession.rootPath);
  const canonicalPath = await resolveObjPath(canonicalRoot, absolutePath, fileSystem);
  assertCurrentSession(expectedSession, access.getCurrentSession());
  const handle = await fileSystem.open(canonicalPath, "r");
  let bytes: Buffer;
  let finalDescriptorStat: ObjStat;

  try {
    const initialDescriptorStat = await handle.stat() as ObjStat;
    assertReadableObjStat(initialDescriptorStat);
    assertCurrentSession(expectedSession, access.getCurrentSession());
    bytes = Buffer.allocUnsafe(initialDescriptorStat.size);

    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!Number.isInteger(result.bytesRead) || result.bytesRead <= 0) {
        throw new Error("O OBJ foi alterado durante a leitura.");
      }
      offset += result.bytesRead;
    }

    finalDescriptorStat = await handle.stat() as ObjStat;
    if (offset !== initialDescriptorStat.size ||
        !sameOpenFileVersion(initialDescriptorStat, finalDescriptorStat)) {
      throw new Error("O OBJ foi alterado durante a leitura.");
    }
    assertCurrentSession(expectedSession, access.getCurrentSession());
  } finally {
    await handle.close();
  }

  assertCurrentSession(expectedSession, access.getCurrentSession());
  const currentRoot = await fileSystem.realpath(expectedSession.rootPath);
  const currentPath = await fileSystem.realpath(canonicalPath);
  if (normalizePath(currentRoot) !== normalizePath(canonicalRoot) ||
      normalizePath(currentPath) !== normalizePath(canonicalPath) ||
      !isPathInside(currentRoot, currentPath)) {
    throw new Error("O OBJ foi substituído durante a leitura.");
  }

  const currentPathStat = await fileSystem.stat(currentPath);
  const identityMismatches = fileIdentityMismatches(finalDescriptorStat, currentPathStat);
  if (identityMismatches.length > 0) {
    throw new Error(
      `O OBJ foi substituído durante a leitura. Campos divergentes: ${identityMismatches.join(", ")}.`
    );
  }

  assertCurrentSession(expectedSession, access.getCurrentSession());
  const result = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(result).set(bytes);
  return result;
}

async function resolveObjPath(
  canonicalRoot: string,
  absolutePath: string,
  fileSystem: ObjFileSystem
) {
  if (typeof absolutePath !== "string" || !path.isAbsolute(absolutePath)) {
    throw new Error("Caminho de OBJ inválido.");
  }

  const canonicalPath = await fileSystem.realpath(absolutePath);
  if (!isPathInside(canonicalRoot, canonicalPath)) {
    throw new Error("O OBJ está fora da biblioteca ativa.");
  }
  if (path.extname(canonicalPath).toLowerCase() !== ".obj") {
    throw new Error("O arquivo não é um OBJ suportado.");
  }
  return canonicalPath;
}

function assertReadableObjStat(fileStat: ObjStat) {
  if (!fileStat.isFile()) throw new Error("O caminho não aponta para um arquivo OBJ.");
  if (!Number.isSafeInteger(fileStat.size) || fileStat.size < 0) {
    throw new Error("Tamanho de OBJ inválido.");
  }
  if (fileStat.size > OBJ_PREVIEW_BUDGET.maxSourceBytes) {
    throw new Error(OBJ_PREVIEW_LIMIT_ERROR);
  }
}

function sameFileIdentity(left: ObjStat, right: ObjStat) {
  return fileIdentityMismatches(left, right).length === 0;
}

function sameOpenFileVersion(left: ObjStat, right: ObjStat) {
  return sameFileIdentity(left, right) && left.ctimeMs === right.ctimeMs;
}

function fileIdentityMismatches(left: ObjStat, right: ObjStat): string[] {
  const mismatches: string[] = [];
  if (!right.isFile()) mismatches.push("type");
  if (left.size !== right.size) mismatches.push("size");
  if (left.dev !== right.dev) mismatches.push("dev");
  if (left.ino !== right.ino) mismatches.push("ino");
  if (left.mtimeMs !== right.mtimeMs) mismatches.push("mtime");
  return mismatches;
}

function assertCurrentSession(expected: LibrarySessionRef, current: LibrarySessionRef | null) {
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

function normalizePath(value: string) {
  return path.resolve(value).replaceAll("/", "\\").toLowerCase();
}
