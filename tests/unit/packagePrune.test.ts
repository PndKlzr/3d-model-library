import { createRequire } from "node:module";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);

describe("packaged runtime pruning", () => {
  it("removes source maps but preserves executable runtime files", () => {
    const { shouldRemovePackageFile } = require(
      resolve(projectRoot, "scripts/prune-package-files.cjs"),
    );

    expect(shouldRemovePackageFile("node_modules/ajv/dist/core.js.map")).toBe(true);
    expect(shouldRemovePackageFile("dist-renderer/assets/index.js.map")).toBe(true);
    expect(shouldRemovePackageFile("node_modules/ajv/dist/core.js")).toBe(false);
    expect(shouldRemovePackageFile("dist-electron/electron/main.js")).toBe(false);
  });

  it("registers pruning before Forge creates the ASAR", () => {
    const config = require(resolve(projectRoot, "forge.config.cjs"));

    expect(config.packagerConfig.afterPrune).toHaveLength(1);
    expect(config.packagerConfig.afterPrune[0].name).toBe("prunePackageFiles");
  });

  it("accepts the Electron Packager v19 hook object and removes maps only", async () => {
    const { prunePackageFiles } = require(
      resolve(projectRoot, "scripts/prune-package-files.cjs"),
    );
    const buildPath = await mkdtemp(resolve(tmpdir(), "model-library-package-"));
    const packageDirectory = resolve(buildPath, "node_modules", "example");
    const sourceMap = resolve(packageDirectory, "index.js.map");
    const runtimeFile = resolve(packageDirectory, "index.js");

    try {
      await mkdir(packageDirectory, { recursive: true });
      await writeFile(sourceMap, "{}");
      await writeFile(runtimeFile, "export {};");

      await prunePackageFiles({ buildPath });

      await expect(access(sourceMap)).rejects.toThrow();
      await expect(access(runtimeFile)).resolves.toBeUndefined();
    } finally {
      await rm(buildPath, { recursive: true, force: true });
    }
  });
});
