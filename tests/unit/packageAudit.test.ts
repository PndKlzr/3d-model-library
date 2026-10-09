import { describe, expect, it } from "vitest";
import {
  containsPersonalPath,
  findForbiddenPackagedPaths,
  isExtractableAsarEntry,
  toAsarLookupPath,
} from "../../scripts/verify-package.mjs";

describe("packaged application privacy audit", () => {
  it("allows only expected runtime roots and compiled source modules", () => {
    expect(
      findForbiddenPackagedPaths([
        "/package.json",
        "/dist-electron/electron/main.js",
        "/dist-electron/src/shared/types.js",
        "/dist-renderer/index.html",
        "/node_modules/electron-store/index.js",
      ]),
    ).toEqual([]);
  });

  it.each([
    "/.git/config",
    "/.github/workflows/ci.yml",
    "/docs/private.md",
    "/tests/unit/private.test.ts",
    "/src/App.tsx",
    "/scripts/electron-dev.cjs",
    "/tools/native-drop-probe/probe.cs",
    "/.env.local",
    "/debug.log",
    "/dist-renderer/assets/index.js.map",
    "/.3d-model-library/3D_LIBRARY_DATA_DO_NOT_DELETE.json",
    "/benchmark-results/cold.json",
    "/sample.stl",
    "/sample.3mf",
    "/sample.obj",
    "/sample.zip",
    "/sample.rar",
    "/sample.7z",
  ])("rejects forbidden packaged entry %s", (entry) => {
    expect(findForbiddenPackagedPaths([entry])).toEqual([entry]);
  });

  it("detects a personal profile path without returning the sensitive value", () => {
    const profileRoot = "C:\\Users\\PrivatePerson";
    const bundledText = `const example = "${profileRoot}\\Desktop\\Models";`;

    expect(containsPersonalPath(bundledText, profileRoot)).toBe(true);
    expect(containsPersonalPath("const relative = './models';", profileRoot)).toBe(false);
  });

  it("normalizes Windows ASAR entries before extracting their contents", () => {
    expect(toAsarLookupPath("\\dist-electron\\electron\\main.js")).toBe(
      "dist-electron\\electron\\main.js",
    );
  });

  it("scans files but skips ASAR directories and links", () => {
    expect(isExtractableAsarEntry({ size: 42, offset: "0" })).toBe(true);
    expect(isExtractableAsarEntry({ files: {} })).toBe(false);
    expect(isExtractableAsarEntry({ link: "target" })).toBe(false);
  });
});
