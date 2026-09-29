import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("repository automation", () => {
  it("verifies the Windows project with pinned, least-privilege actions", () => {
    const workflow = readProjectFile(".github/workflows/ci.yml");

    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toMatch(/actions\/checkout@[a-f0-9]{40}/);
    expect(workflow).toMatch(/actions\/setup-node@[a-f0-9]{40}/);
    expect(workflow).toContain("node-version: 22.12.0");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm audit");
  });

  it("keeps dependency updates bounded and grouped", () => {
    const dependabot = readProjectFile(".github/dependabot.yml");

    expect(dependabot).toContain('package-ecosystem: "npm"');
    expect(dependabot).toContain('package-ecosystem: "github-actions"');
    expect(dependabot).toMatch(/interval:\s*"weekly"/g);
    expect(dependabot).toContain("open-pull-requests-limit: 5");
    expect(dependabot).toContain("groups:");
    expect(dependabot).toContain('dependency-type: "production"');
    expect(dependabot).toContain('dependency-type: "development"');
  });

  it("documents the current verified security baseline", () => {
    const readiness = readProjectFile(
      "docs/security/release-readiness-2026-09-16.md",
    );
    const publicationChecklist = readProjectFile(
      "docs/security/github-publication-checklist.md",
    );

    expect(readiness).toContain("Vitest `5.0.2`");
    expect(readiness).toContain("**0 vulnerabilities**");
    expect(readiness).toContain("**103 test files and 754 tests passed**");
    expect(readiness).not.toContain("719 tests passed");
    expect(readiness).not.toContain("5 development-only vulnerabilities");
    expect(publicationChecklist).toContain(
      "Require status checks to pass before merging",
    );
    expect(publicationChecklist).toContain("Private vulnerability reporting");
    expect(publicationChecklist).toContain("Secret scanning");
  });
});
