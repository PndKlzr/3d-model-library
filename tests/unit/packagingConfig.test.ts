import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);

describe("Windows packaging configuration", () => {
  it("defines stable product metadata and reproducible Windows scripts", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(projectRoot, "package.json"), "utf8"),
    );

    expect(packageJson.productName).toBe("3D Model Library");
    expect(packageJson.description).toMatch(/3D-printing libraries/i);
    expect(packageJson.author).toBe("PndKlzr");
    expect(packageJson.license).toBe("GPL-3.0-only");
    expect(packageJson.scripts["package:windows"]).toContain("npm run build");
    expect(packageJson.scripts["package:windows"]).toContain("electron-forge package");
    expect(packageJson.scripts["make:windows"]).toContain("npm run build");
    expect(packageJson.scripts["make:windows"]).toContain("--platform win32 --arch x64");
  });

  it("packages an ASAR with integrity fuses and both Windows artifact makers", () => {
    const configPath = resolve(projectRoot, "forge.config.cjs");
    const exists = existsSync(configPath);
    expect(exists).toBe(true);
    if (!exists) return;

    const config = require(configPath);
    expect(config.packagerConfig.asar).toBe(true);
    expect(config.packagerConfig.prune).toBe(true);
    expect(config.packagerConfig.executableName).toBe("3D Model Library");
    expect(config.packagerConfig.icon).toMatch(/assets[\\/]app-icon$/);
    expect(config.packagerConfig.ignore("/dist-electron/electron/main.js")).toBe(false);
    expect(config.packagerConfig.ignore("/dist-renderer/index.html")).toBe(false);
    expect(config.packagerConfig.ignore("/node_modules/electron-store/index.js")).toBe(false);
    expect(config.packagerConfig.ignore("/tests/unit/private.test.ts")).toBe(true);
    expect(config.packagerConfig.ignore("/docs/assets/library-overview.png")).toBe(true);
    expect(config.packagerConfig.ignore("/scripts/electron-dev.cjs")).toBe(true);
    expect(config.packagerConfig.ignore("/tools/native-drop-probe/probe.cs")).toBe(true);

    const makerNames = config.makers.map((maker: { name: string }) => maker.name);
    expect(makerNames).toContain("@electron-forge/maker-squirrel");
    expect(makerNames).toContain("@electron-forge/maker-zip");

    const squirrel = config.makers.find(
      (maker: { name: string }) => maker.name === "@electron-forge/maker-squirrel",
    );
    expect(squirrel.config.setupExe).toBe("3D-Model-Library-Setup.exe");

    const configSource = readFileSync(configPath, "utf8");
    expect(configSource).toContain("EnableEmbeddedAsarIntegrityValidation");
    expect(configSource).toContain("OnlyLoadAppFromAsar");
    expect(configSource).toContain("RunAsNode");
    expect(configSource).toContain("EnableNodeOptionsEnvironmentVariable");
    expect(configSource).toContain("EnableNodeCliInspectArguments");
  });

  it("commits a Windows icon and ignores generated Forge output", () => {
    const iconPath = resolve(projectRoot, "assets/app-icon.ico");
    const exists = existsSync(iconPath);
    expect(exists).toBe(true);
    if (!exists) return;

    const iconHeader = [...readFileSync(iconPath).subarray(0, 4)];
    expect(iconHeader).toEqual([0, 0, 1, 0]);

    const gitignore = readFileSync(resolve(projectRoot, ".gitignore"), "utf8");
    expect(gitignore.split(/\r?\n/)).toContain("out/");
  });
});
