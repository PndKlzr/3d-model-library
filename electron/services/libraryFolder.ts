import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { LibrarySessionRef } from "../../src/shared/types.js";
import { isPathAtOrInside } from "./pathContainment.js";
import { PORTABLE_METADATA_DIRECTORY } from "./portableMetadataCodec.js";

type FolderFileSystem = {
  realpath: (value: string) => Promise<string>;
  stat: (value: string) => Promise<{ isDirectory: () => boolean }>;
};

export type LibraryFolderAccess = {
  getCurrentSession: () => LibrarySessionRef | null;
  openPath: (value: string) => Promise<string>;
  fileSystem?: FolderFileSystem;
};

export type LibraryDataFolderAccess = {
  getCurrentSession: () => LibrarySessionRef | null;
  getDataDirectory: (rootPath: string) => Promise<string>;
  openPath: (value: string) => Promise<string>;
};

const defaultFileSystem: FolderFileSystem = { realpath, stat };

export async function showLibraryFolder(
  expectedSession: LibrarySessionRef,
  relativeFolder: string,
  access: LibraryFolderAccess
): Promise<void> {
  assertCurrentSession(expectedSession, access.getCurrentSession());
  const normalizedRelativeFolder = normalizeRelativeFolder(relativeFolder);
  const fileSystem = access.fileSystem ?? defaultFileSystem;
  const canonicalRoot = await resolveCanonicalDirectory(expectedSession.rootPath, fileSystem);

  if (normalizePath(canonicalRoot) !== normalizePath(expectedSession.rootPath)) {
    throw new Error("A pasta raiz da biblioteca foi alterada.");
  }

  const requestedPath = normalizedRelativeFolder
    ? path.resolve(canonicalRoot, ...normalizedRelativeFolder.split("/"))
    : canonicalRoot;
  if (!isPathAtOrInside(canonicalRoot, requestedPath)) {
    throw new Error("A pasta está fora da biblioteca ativa.");
  }

  const canonicalTarget = await resolveCanonicalDirectory(requestedPath, fileSystem);
  if (!isPathAtOrInside(canonicalRoot, canonicalTarget)) {
    throw new Error("A pasta está fora da biblioteca ativa.");
  }

  assertCurrentSession(expectedSession, access.getCurrentSession());
  const liveRoot = await resolveCanonicalDirectory(expectedSession.rootPath, fileSystem);
  const liveTarget = await resolveCanonicalDirectory(requestedPath, fileSystem);
  if (
    normalizePath(liveRoot) !== normalizePath(canonicalRoot) ||
    normalizePath(liveTarget) !== normalizePath(canonicalTarget) ||
    !isPathAtOrInside(liveRoot, liveTarget)
  ) {
    throw new Error("A pasta da biblioteca foi alterada antes de ser aberta.");
  }

  assertCurrentSession(expectedSession, access.getCurrentSession());
  const failure = await access.openPath(liveTarget);
  if (failure) throw new Error(failure);
  assertCurrentSession(expectedSession, access.getCurrentSession());
}

export async function showLibraryDataFolder(
  expectedSession: LibrarySessionRef,
  access: LibraryDataFolderAccess
): Promise<void> {
  assertCurrentSession(expectedSession, access.getCurrentSession());
  const dataDirectory = await access.getDataDirectory(expectedSession.rootPath);
  const expectedDirectory = path.join(expectedSession.rootPath, PORTABLE_METADATA_DIRECTORY);
  if (normalizePath(dataDirectory) !== normalizePath(expectedDirectory)) {
    throw new Error("A pasta interna de dados da biblioteca é inválida.");
  }

  assertCurrentSession(expectedSession, access.getCurrentSession());
  const failure = await access.openPath(dataDirectory);
  if (failure) throw new Error(failure);
  assertCurrentSession(expectedSession, access.getCurrentSession());
}

async function resolveCanonicalDirectory(value: string, fileSystem: FolderFileSystem) {
  try {
    const canonicalPath = await fileSystem.realpath(value);
    const targetStat = await fileSystem.stat(canonicalPath);
    if (!targetStat.isDirectory()) throw new Error("not-directory");
    return canonicalPath;
  } catch {
    throw new Error("A pasta da biblioteca não existe ou não está acessível.");
  }
}

function normalizeRelativeFolder(value: string): string {
  if (typeof value !== "string" || value.includes("\0")) {
    throw new Error("Pasta da biblioteca inválida.");
  }
  if (!value) return "";
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || /^[a-z]:/i.test(value)) {
    throw new Error("A pasta deve ser relativa à biblioteca.");
  }

  const parts = value.split(/[\\/]+/);
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("A pasta deve permanecer dentro da biblioteca.");
  }
  return parts.join("/");
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

function normalizePath(value: string): string {
  return path.resolve(value).replaceAll("/", "\\").toLowerCase();
}
