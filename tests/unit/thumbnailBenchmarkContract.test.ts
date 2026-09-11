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
    expect(main.indexOf("realpathSync")).toBeGreaterThan(-1);
    expect(main.indexOf("realpathSync")).toBeLessThan(main.indexOf('app.setPath("userData"'));
    expect(main.indexOf('app.setPath("userData"')).toBeLessThan(main.indexOf("app.whenReady()"));
    expect(main).toContain('ipcMain.handle("benchmark:get-config"');
    expect(main).toContain('ipcMain.handle("benchmark:submit-report"');
    expect(main).toContain('ipcMain.handle("benchmark:fatal"');
    expect(main).toContain("failBenchmark");
    expect(main).toContain('window.webContents.on("did-fail-load"');
    expect(main).toContain('window.webContents.on("render-process-gone"');
    expect(main).toContain(".catch(failBenchmark)");
    expect(main).toContain("MODEL_LIBRARY_BENCHMARK_FAILURE_PROBE");
    expect(main).toContain('benchmarkEnvironment && benchmarkFailureProbe === "load"');
    expect(main).toContain('benchmarkFailureProbe === "report"');
    expect(main.indexOf('benchmarkFailureProbe === "report"'))
      .toBeGreaterThan(main.indexOf('ipcMain.handle("benchmark:submit-report"'));
    expect(main).toContain('path.join(__dirname, "..", "..", "dist-renderer", "index.html")');
    expect(preload).toContain('ipcRenderer.invoke("benchmark:get-config")');
    expect(preload).toContain('ipcRenderer.invoke("benchmark:submit-report"');
    expect(preload).toContain('ipcRenderer.invoke("benchmark:fatal"');
  });

  it("restores an isolated cached index while reconciliation and rendering proceed", async () => {
    const main = await readFile("electron/main.ts", "utf8");
    const app = await readFile("src/App.tsx", "utf8");
    const preload = await readFile("electron/preload.cjs", "utf8");

    expect(main).toContain("benchmarkCachedIndexReadyMs");
    expect(main).toContain("benchmarkCachedGridVisibleMs");
    expect(main).toContain("benchmarkLibraryReconciliationSettledMs");
    expect(main).toContain("benchmarkReconciliationPromise");
    expect(main).toContain('ipcMain.handle("benchmark:cached-grid-visible"');
    expect(main).toContain("createInMemoryLibraryIndexStore()");
    expect(main).toContain("await libraryIndexStore.load(benchmarkEnvironment.root)");
    expect(main).toContain("await libraryIndexStore.save");
    expect(main).toContain("backgroundThrottling: !benchmarkEnvironment");
    expect(main).not.toContain("createElectronLibraryIndexStore");
    expect(main.indexOf("benchmarkStartupStartedAt = performance.now()"))
      .toBeLessThan(main.indexOf("await libraryIndexStore.load(benchmarkEnvironment.root)"));
    expect(main.indexOf("benchmarkReconciliationPromise = scanLibrary"))
      .toBeGreaterThan(main.indexOf('ipcMain.handle("benchmark:get-config"'));
    expect(app).toContain("benchmark-cached-grid");
    expect(app).toContain("markThumbnailBenchmarkCachedGridVisible");
    expect(preload).toContain('ipcRenderer.invoke("benchmark:cached-grid-visible")');
  });

  it("builds renderer assets with file-compatible relative URLs", async () => {
    const vite = await readFile("vite.config.ts", "utf8");

    expect(vite).toContain('base: "./"');
  });
});
