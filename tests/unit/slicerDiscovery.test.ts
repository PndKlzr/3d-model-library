import { describe, expect, it, vi } from "vitest";
import {
  discoverWindowsSlicers,
  mergeSlicerCandidates,
  parseRegistrySlicerCandidates,
  type SlicerCandidate
} from "../../electron/services/slicerDiscovery";

describe("slicer discovery", () => {
  it("parses uninstall, App Paths, association, and quoted DisplayIcon records", () => {
    const output = String.raw`
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\Cura
    DisplayName    REG_SZ    UltiMaker Cura 5.11
    DisplayVersion    REG_SZ    5.11.0
    DisplayIcon    REG_SZ    "C:\Program Files\UltiMaker Cura 5.11\UltiMaker-Cura.exe",0

HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\App Paths\CrealityPrint.exe
    (Default)    REG_SZ    C:\Program Files\Creality Print 7.1\CrealityPrint.exe

HKEY_CLASSES_ROOT\OrcaSlicer.3mf\shell\open\command
    (Default)    REG_SZ    "D:\Apps\OrcaSlicer\orca-slicer.exe" "%1"
`;

    expect(parseRegistrySlicerCandidates(output)).toEqual([
      {
        builtInKey: "cura",
        executablePath: "C:\\Program Files\\UltiMaker Cura 5.11\\UltiMaker-Cura.exe",
        version: "5.11.0",
        evidence: "uninstall"
      },
      {
        builtInKey: "creality-print",
        executablePath: "C:\\Program Files\\Creality Print 7.1\\CrealityPrint.exe",
        evidence: "app-path"
      },
      {
        builtInKey: "orca-slicer",
        executablePath: "D:\\Apps\\OrcaSlicer\\orca-slicer.exe",
        evidence: "association"
      }
    ]);
  });

  it("rejects malformed registry records and non-executable values", () => {
    const output = String.raw`
HKEY_CURRENT_USER\Software\Bad
    DisplayName    REG_SZ    Cura Theme
    DisplayIcon    REG_SZ    C:\Pictures\cura.png

HKEY_CURRENT_USER\Software\Broken
    DisplayName    REG_SZ    PrusaSlicer
    DisplayIcon    REG_SZ    not a path
`;

    expect(parseRegistrySlicerCandidates(output)).toEqual([]);
  });

  it("deduplicates paths case-insensitively and keeps the strongest evidence", () => {
    const candidates: SlicerCandidate[] = [
      candidate("cura", "C:\\Apps\\Cura.exe", "known-directory"),
      candidate("cura", "c:\\apps\\CURA.EXE", "app-path"),
      candidate("prusa-slicer", "C:\\Apps\\Prusa.exe", "association")
    ];

    expect(mergeSlicerCandidates(candidates)).toEqual([
      candidate("cura", "c:\\apps\\CURA.EXE", "app-path"),
      candidate("prusa-slicer", "C:\\Apps\\Prusa.exe", "association")
    ]);
  });

  it("canonicalizes existing files and discards missing files, directories, and non-executables", async () => {
    const execute = vi.fn(async (_file: string, args: readonly string[]) =>
      args[0] === "query"
        ? String.raw`HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\App Paths\Cura.exe
    (Default)    REG_SZ    C:\Apps\Cura.exe`
        : ""
    );
    const stat = vi.fn(async (filePath: string) => ({
      isFile: () => !filePath.includes("Directory") && !filePath.includes("Missing")
    }));
    const realpath = vi.fn(async (filePath: string) => filePath.replace("C:\\Apps", "D:\\Canonical"));

    const result = await discoverWindowsSlicers({
      platform: "win32",
      execute,
      stat,
      realpath,
      knownCandidates: [
        candidate("prusa-slicer", "C:\\Apps\\Directory.exe", "known-directory"),
        candidate("bambu-studio", "C:\\Apps\\Missing.exe", "known-directory"),
        candidate("ideamaker", "C:\\Apps\\readme.txt", "known-directory")
      ],
      startMenuCandidates: []
    });

    expect(result).toEqual([
      candidate("cura", "D:\\Canonical\\Cura.exe", "app-path")
    ]);
    expect(execute).toHaveBeenCalled();
  });

  it("does nothing outside Windows", async () => {
    const execute = vi.fn();
    expect(await discoverWindowsSlicers({ platform: "linux", execute })).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("places stronger evidence first when one slicer has multiple installations", async () => {
    const result = await discoverWindowsSlicers({
      platform: "win32",
      execute: async () => "",
      stat: async () => ({ isFile: () => true }),
      realpath: async (filePath) => filePath,
      knownCandidates: [
        candidate("cura", "C:\\Apps\\old.exe", "known-directory"),
        candidate("cura", "C:\\Apps\\current.exe", "app-path")
      ],
      startMenuCandidates: []
    });

    expect(result.map((item) => item.executablePath)).toEqual([
      "C:\\Apps\\current.exe",
      "C:\\Apps\\old.exe"
    ]);
  });

  it("discovers versioned Cura folders and prefers the newest installed version", async () => {
    const result = await discoverWindowsSlicers({
      platform: "win32",
      execute: async () => "",
      stat: async () => ({ isFile: () => true }),
      realpath: async (filePath) => filePath,
      env: { ProgramFiles: "C:\\Program Files" },
      knownCandidates: [],
      startMenuCandidates: [],
      readdir: async () => [
        { name: "UltiMaker Cura 5.11.0", isDirectory: () => true },
        { name: "UltiMaker Cura 5.13.0", isDirectory: () => true },
        { name: "Cura Theme", isDirectory: () => true }
      ]
    });

    expect(result.filter((item) => item.builtInKey === "cura").map((item) => item.executablePath)).toEqual([
      "C:\\Program Files\\UltiMaker Cura 5.13.0\\UltiMaker-Cura.exe",
      "C:\\Program Files\\UltiMaker Cura 5.13.0\\Cura.exe",
      "C:\\Program Files\\UltiMaker Cura 5.11.0\\UltiMaker-Cura.exe",
      "C:\\Program Files\\UltiMaker Cura 5.11.0\\Cura.exe"
    ]);
    expect(result.some((item) => item.executablePath.includes("Cura Theme"))).toBe(false);
  });
});

function candidate(
  builtInKey: SlicerCandidate["builtInKey"],
  executablePath: string,
  evidence: SlicerCandidate["evidence"]
): SlicerCandidate {
  return { builtInKey, executablePath, evidence };
}
