import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("thumbnail benchmark isolation contract", () => {
  it("launches Electron with a predetermined output and isolated user data", async () => {
    const source = await readFile("scripts/thumbnail-benchmark.cjs", "utf8");

    expect(source).toContain("MODEL_LIBRARY_BENCHMARK_ROOT");
    expect(source).toContain("MODEL_LIBRARY_BENCHMARK_SCENARIO");
    expect(source).toContain("MODEL_LIBRARY_BENCHMARK_OUTPUT");
    expect(source).toContain("MODEL_LIBRARY_BENCHMARK_USER_DATA");
    expect(source).toContain("mkdtemp");
    expect(source).toContain("require.main === module");
  });

  it("uses a benchmark-only startup path and a fixed report channel", async () => {
    const main = await readFile("electron/main.ts", "utf8");
    const preload = await readFile("electron/preload.cjs", "utf8");

    expect(main.indexOf('app.setPath("userData"')).toBeGreaterThan(-1);
    expect(main.indexOf('app.setPath("userData"')).toBeLessThan(main.indexOf("app.whenReady()"));
    expect(main).toContain('ipcMain.handle("benchmark:get-config"');
    expect(main).toContain('ipcMain.handle("benchmark:submit-report"');
    expect(main).toContain('path.join(__dirname, "..", "..", "dist-renderer", "index.html")');
    expect(preload).toContain('ipcRenderer.invoke("benchmark:get-config")');
    expect(preload).toContain('ipcRenderer.invoke("benchmark:submit-report"');
  });

  it("builds renderer assets with file-compatible relative URLs", async () => {
    const vite = await readFile("vite.config.ts", "utf8");

    expect(vite).toContain('base: "./"');
  });
});
