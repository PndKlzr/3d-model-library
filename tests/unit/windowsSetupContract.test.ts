import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");

describe("Windows development setup", () => {
  it("uses a reproducible install and creates the development shortcut", () => {
    const setup = readFileSync(resolve(projectRoot, "setup-windows.cmd"), "utf8");

    expect(setup).toContain("npm ci");
    expect(setup).toContain("create-development-shortcut.ps1");
    expect(setup).not.toMatch(/Invoke-WebRequest|curl|wget/i);
  });

  it("starts only the checked-in development command from the project directory", () => {
    const launcher = readFileSync(resolve(projectRoot, "start-3d-model-library.cmd"), "utf8");

    expect(launcher).toContain("cd /d \"%~dp0\"");
    expect(launcher).toContain("npm run electron:dev");
    expect(launcher).not.toMatch(/Invoke-WebRequest|curl|wget/i);
  });
});
