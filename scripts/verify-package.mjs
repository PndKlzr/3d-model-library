import { extractFile, listPackage, statFile } from "@electron/asar";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FORBIDDEN_ROOTS = new Set([
  ".git",
  ".github",
  ".superpowers",
  ".3d-model-library",
  "benchmark-results",
  "docs",
  "scripts",
  "src",
  "tests",
  "tools",
]);
const FORBIDDEN_EXTENSIONS = new Set([
  ".3mf",
  ".7z",
  ".log",
  ".map",
  ".obj",
  ".rar",
  ".stl",
  ".zip",
]);
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json"]);
const MAX_TEXT_SCAN_BYTES = 12 * 1024 * 1024;

export function findForbiddenPackagedPaths(paths) {
  return paths.filter((entry) => {
    const normalized = normalizeAsarPath(entry);
    const segments = normalized.split("/").filter(Boolean);
    const root = segments[0]?.toLowerCase() ?? "";
    const basename = segments.at(-1)?.toLowerCase() ?? "";

    if (FORBIDDEN_ROOTS.has(root)) return true;
    if (root === ".env" || root.startsWith(".env.")) return true;
    return FORBIDDEN_EXTENSIONS.has(path.posix.extname(basename));
  });
}

export function containsPersonalPath(content, profileRoot) {
  if (!profileRoot) return false;

  const normalizedContent = content.toLowerCase();
  const candidates = new Set([
    profileRoot,
    profileRoot.replaceAll("\\", "/"),
    profileRoot.replaceAll("\\", "\\\\"),
  ]);

  return [...candidates].some((candidate) =>
    normalizedContent.includes(candidate.toLowerCase()),
  );
}

export function toAsarLookupPath(entry) {
  return entry.replace(/^[/\\]+/, "");
}

export function isExtractableAsarEntry(fileInfo) {
  return !("files" in fileInfo) && !("link" in fileInfo);
}

export async function verifyPackagedApplication(outRoot, profileRoot) {
  const archives = await findNamedFiles(outRoot, "app.asar");
  if (archives.length !== 1) {
    throw new Error("Expected exactly one packaged app.asar under the Forge output directory.");
  }

  const archivePath = archives[0];
  const entries = listPackage(archivePath);
  const forbiddenEntries = findForbiddenPackagedPaths(entries);
  const personalPathEntries = [];

  for (const entry of entries) {
    const extension = path.posix.extname(entry).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;

    const lookupPath = toAsarLookupPath(entry);
    const fileInfo = statFile(archivePath, lookupPath, false);
    if (!isExtractableAsarEntry(fileInfo)) continue;

    const bytes = extractFile(archivePath, lookupPath, false);
    if (bytes.byteLength > MAX_TEXT_SCAN_BYTES) continue;
    if (containsPersonalPath(bytes.toString("utf8"), profileRoot)) {
      personalPathEntries.push(normalizeAsarPath(entry));
    }
  }

  const failures = [...new Set([...forbiddenEntries, ...personalPathEntries])].sort();
  if (failures.length > 0) {
    throw new Error(`Package audit rejected ${failures.length} runtime entries:\n${failures.join("\n")}`);
  }

  return { archiveCount: archives.length, entryCount: entries.length };
}

async function findNamedFiles(root, expectedName) {
  const matches = [];
  const pending = [root];

  while (pending.length > 0) {
    const directory = pending.pop();
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(absolutePath);
      if (entry.isFile() && entry.name.toLowerCase() === expectedName) matches.push(absolutePath);
    }
  }

  return matches;
}

function normalizeAsarPath(entry) {
  const normalized = entry.replaceAll("\\", "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

async function runCli() {
  const outRoot = path.resolve(process.cwd(), process.argv[2] ?? "out");
  const result = await verifyPackagedApplication(outRoot, process.env.USERPROFILE ?? "");
  console.log(`[package-audit] passed: ${result.entryCount} ASAR entries checked`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  runCli().catch((error) => {
    console.error(`[package-audit] failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exitCode = 1;
  });
}
