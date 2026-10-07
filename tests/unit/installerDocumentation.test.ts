import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");

function read(relativePath: string): string {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("Windows installer documentation", () => {
  it("documents setup and portable installation in both languages", () => {
    const english = read("README.md");
    const portuguese = read("README.pt-BR.md");

    expect(english).toContain("3D-Model-Library-Setup.exe");
    expect(english).toMatch(/portable ZIP/i);
    expect(english).toMatch(/unknown publisher/i);
    expect(english).toContain("npm ci");
    expect(english).toContain(".3d-model-library");

    expect(portuguese).toContain("3D-Model-Library-Setup.exe");
    expect(portuguese).toMatch(/ZIP portátil/i);
    expect(portuguese).toMatch(/editor desconhecido/i);
    expect(portuguese).toContain("npm ci");
    expect(portuguese).toContain(".3d-model-library");
  });

  it("describes the unsigned beta without weakening Windows security", () => {
    const security = read("SECURITY.md");

    expect(security).toMatch(/unsigned|não assinad/i);
    expect(security).not.toMatch(/disable (Windows )?Defender|desativar o (Windows )?Defender/i);
    expect(security).not.toMatch(/add .*exclusion|adicionar .*exclusão/i);
  });

  it("provides a complete installer acceptance checklist", () => {
    const checklist = read("docs/verification/windows-installer-checklist.md");

    for (const expected of [
      "Clean install",
      "Upgrade",
      "Uninstall",
      "Disconnected library",
      "Cura",
      "Creality Print",
      "ZIP, RAR, and 7Z",
      "3MF-to-STL",
      "Windows Defender",
      ".3d-model-library",
    ]) {
      expect(checklist).toContain(expected);
    }
  });
});
