import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  BUILT_IN_SLICERS,
  type BuiltInSlicerDefinition,
  type BuiltInSlicerKey
} from "../../src/shared/slicerCatalog.js";
import type {
  SlicerCandidate,
  SlicerEvidence
} from "../../src/shared/types.js";

export type { SlicerCandidate, SlicerEvidence } from "../../src/shared/types.js";

type FileStat = { isFile: () => boolean };
type DirectoryEntry = { name: string; isDirectory: () => boolean };

export type SlicerDiscoveryOptions = {
  platform?: NodeJS.Platform | string;
  execute?: (file: string, args: readonly string[]) => Promise<string>;
  stat?: (filePath: string) => Promise<FileStat>;
  realpath?: (filePath: string) => Promise<string>;
  readdir?: (directoryPath: string) => Promise<DirectoryEntry[]>;
  env?: NodeJS.ProcessEnv;
  knownCandidates?: SlicerCandidate[];
  startMenuCandidates?: SlicerCandidate[];
};

const execFileAsync = promisify(execFile);
const EVIDENCE_PRIORITY: Record<SlicerEvidence, number> = {
  "app-path": 5,
  uninstall: 4,
  association: 3,
  "start-menu": 2,
  "known-directory": 1
};

const REGISTRY_QUERIES = [
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",
  "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",
  "HKCR\\.stl",
  "HKCR\\.3mf"
] as const;

export function parseRegistrySlicerCandidates(
  output: string,
  catalog: readonly BuiltInSlicerDefinition[] = BUILT_IN_SLICERS
): SlicerCandidate[] {
  const candidates: SlicerCandidate[] = [];
  const blocks = output.split(/(?=^HKEY_)/gim).map((block) => block.trim()).filter(Boolean);

  for (const block of blocks) {
    const definition = findDefinition(block, catalog);
    if (!definition) continue;

    const header = block.split(/\r?\n/, 1)[0].toLowerCase();
    const evidence: SlicerEvidence = header.includes("app paths")
      ? "app-path"
      : header.includes("shell\\open\\command")
        ? "association"
        : "uninstall";
    const executablePath = extractExecutablePath(block)
      ?? executableFromInstallLocation(block, definition);
    if (!executablePath) continue;

    const version = readRegistryValue(block, "DisplayVersion");
    candidates.push({
      builtInKey: definition.key,
      executablePath,
      ...(version ? { version } : {}),
      evidence
    });
  }

  return candidates;
}

export function mergeSlicerCandidates(candidates: readonly SlicerCandidate[]): SlicerCandidate[] {
  const merged = new Map<string, SlicerCandidate>();

  for (const candidate of candidates) {
    const key = candidate.executablePath.toLowerCase();
    const current = merged.get(key);
    if (!current || EVIDENCE_PRIORITY[candidate.evidence] > EVIDENCE_PRIORITY[current.evidence]) {
      merged.set(key, { ...candidate });
    }
  }

  return [...merged.values()];
}

export async function discoverWindowsSlicers(
  options: SlicerDiscoveryOptions = {}
): Promise<SlicerCandidate[]> {
  if ((options.platform ?? process.platform) !== "win32") return [];

  const execute = options.execute ?? executeFile;
  const stat = options.stat ?? fs.stat;
  const realpath = options.realpath ?? fs.realpath;
  const readdir = options.readdir ?? ((directoryPath: string) =>
    fs.readdir(directoryPath, { withFileTypes: true }));
  const registryCandidates: SlicerCandidate[] = [];

  for (const registryPath of REGISTRY_QUERIES) {
    try {
      const output = await execute("reg.exe", ["query", registryPath, "/s"]);
      registryCandidates.push(...parseRegistrySlicerCandidates(output));
    } catch {
      // A missing registry branch is a normal discovery result.
    }
  }

  const knownCandidates = options.knownCandidates
    ?? createKnownDirectoryCandidates(options.env ?? process.env);
  const versionedDirectoryCandidates = options.knownCandidates === undefined || options.readdir
    ? await discoverVersionedDirectoryCandidates(options.env ?? process.env, readdir)
    : [];
  const startMenuCandidates = options.startMenuCandidates
    ?? await discoverStartMenuCandidates(execute);
  const candidates = mergeSlicerCandidates([
    ...registryCandidates,
    ...startMenuCandidates,
    ...versionedDirectoryCandidates,
    ...knownCandidates
  ]);
  const validated: SlicerCandidate[] = [];

  for (const candidate of candidates) {
    if (!candidate.executablePath.toLowerCase().endsWith(".exe") || !path.isAbsolute(candidate.executablePath)) {
      continue;
    }
    try {
      const fileStat = await stat(candidate.executablePath);
      if (!fileStat.isFile()) continue;
      const canonicalPath = await realpath(candidate.executablePath);
      if (!canonicalPath.toLowerCase().endsWith(".exe")) continue;
      validated.push({ ...candidate, executablePath: canonicalPath });
    } catch {
      // Stale registry records and removed programs are ignored.
    }
  }

  return mergeSlicerCandidates(validated).sort(compareSlicerCandidates);
}

async function discoverVersionedDirectoryCandidates(
  env: NodeJS.ProcessEnv,
  readdir: (directoryPath: string) => Promise<DirectoryEntry[]>
): Promise<SlicerCandidate[]> {
  const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(
    (value): value is string => Boolean(value)
  );
  const candidates: SlicerCandidate[] = [];

  for (const root of new Set(roots)) {
    let entries: DirectoryEntry[];
    try {
      entries = await readdir(root);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const normalizedName = entry.name.toLowerCase();
      const definition = BUILT_IN_SLICERS.find((item) =>
        item.aliases.some((alias) => normalizedName.startsWith(`${alias.toLowerCase()} `))
      );
      if (!definition || !extractVersion(entry.name)) continue;

      for (const executableName of definition.executableNames) {
        candidates.push({
          builtInKey: definition.key,
          executablePath: path.win32.join(root, entry.name, executableName),
          version: extractVersion(entry.name) ?? undefined,
          evidence: "known-directory"
        });
      }
    }
  }

  return candidates;
}

function compareSlicerCandidates(left: SlicerCandidate, right: SlicerCandidate): number {
  if (left.builtInKey === right.builtInKey) {
    const versionOrder = compareVersions(
      extractVersion(right.version ?? right.executablePath),
      extractVersion(left.version ?? left.executablePath)
    );
    if (versionOrder !== 0) return versionOrder;
  }
  return EVIDENCE_PRIORITY[right.evidence] - EVIDENCE_PRIORITY[left.evidence];
}

function compareVersions(left: string | null, right: string | null): number {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function extractVersion(value: string): string | null {
  return value.match(/\d+(?:\.\d+)+/)?.[0] ?? null;
}

function findDefinition(
  value: string,
  catalog: readonly BuiltInSlicerDefinition[]
): BuiltInSlicerDefinition | undefined {
  const normalized = value.toLowerCase();
  return catalog.find((definition) =>
    definition.aliases.some((alias) => normalized.includes(alias.toLowerCase()))
    || definition.executableNames.some((name) => normalized.includes(name.toLowerCase()))
  );
}

function extractExecutablePath(block: string): string | null {
  const quoted = block.match(/"([A-Za-z]:\\[^"\r\n]+?\.exe)"/i)?.[1];
  if (quoted) return quoted.trim();
  return block.match(/([A-Za-z]:\\[^\r\n,]*?\.exe)(?:\s|,|$)/i)?.[1].trim() ?? null;
}

function executableFromInstallLocation(
  block: string,
  definition: BuiltInSlicerDefinition
): string | null {
  const installLocation = readRegistryValue(block, "InstallLocation")?.replace(/^"|"$/g, "");
  return installLocation ? path.win32.join(installLocation, definition.executableNames[0]) : null;
}

function readRegistryValue(block: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return block.match(new RegExp(`^\\s*${escapedName}\\s+REG_\\w+\\s+(.+)$`, "im"))?.[1].trim() ?? null;
}

function createKnownDirectoryCandidates(env: NodeJS.ProcessEnv): SlicerCandidate[] {
  const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(
    (value): value is string => Boolean(value)
  );
  const directoryNames: Record<BuiltInSlicerKey, readonly string[]> = {
    cura: ["UltiMaker Cura", "Ultimaker Cura"],
    "creality-print": ["Creality Print"],
    "orca-slicer": ["OrcaSlicer", "Orca Slicer"],
    "prusa-slicer": ["Prusa3D\\PrusaSlicer", "PrusaSlicer"],
    "bambu-studio": ["Bambu Studio"],
    "anycubic-slicer-next": ["AnycubicSlicerNext", "Anycubic Slicer Next"],
    ideamaker: ["ideaMaker"],
    "elegoo-satellite": ["ELEGOO SatelLite"]
  };

  return BUILT_IN_SLICERS.flatMap((definition) =>
    roots.flatMap((root) =>
      directoryNames[definition.key].flatMap((directory) =>
        definition.executableNames.map((executableName) => ({
          builtInKey: definition.key,
          executablePath: path.win32.join(root, directory, executableName),
          evidence: "known-directory" as const
        }))
      )
    )
  );
}

async function discoverStartMenuCandidates(
  execute: (file: string, args: readonly string[]) => Promise<string>
): Promise<SlicerCandidate[]> {
  try {
    const script = [
      "$roots=@($env:ProgramData+'\\Microsoft\\Windows\\Start Menu\\Programs',$env:APPDATA+'\\Microsoft\\Windows\\Start Menu\\Programs')",
      "$shell=New-Object -ComObject WScript.Shell",
      "Get-ChildItem -LiteralPath $roots -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {",
      "  try { $target=$shell.CreateShortcut($_.FullName).TargetPath; if($target){$target} } catch {}",
      "}"
    ].join("\n");
    const encodedScript = Buffer.from(script, "utf16le").toString("base64");
    const output = await execute("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-EncodedCommand",
      encodedScript
    ]);
    return output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
      .flatMap((executablePath): SlicerCandidate[] => {
        const definition = findDefinition(executablePath, BUILT_IN_SLICERS);
        return definition && executablePath.toLowerCase().endsWith(".exe")
          ? [{ builtInKey: definition.key, executablePath, evidence: "start-menu" }]
          : [];
      });
  } catch {
    return [];
  }
}

async function executeFile(file: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync(file, [...args], {
    windowsHide: true,
    encoding: "utf8",
    timeout: 8_000,
    maxBuffer: 4 * 1024 * 1024
  });
  return result.stdout;
}
