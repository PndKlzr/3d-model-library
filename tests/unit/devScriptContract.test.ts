import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("dev script contract", () => {
  it("keeps a stable renderer origin so visual preferences survive restarts", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    const devScript = await readFile("scripts/electron-dev.cjs", "utf8");
    const mainSource = await readFile("electron/main.ts", "utf8");

    expect(packageJson.scripts.dev).toContain("--strictPort");
    expect(packageJson.scripts["electron:dev"]).toBe("node scripts/electron-dev.cjs");
    expect(devScript).toContain('const VITE_URL = "http://127.0.0.1:5173"');
    expect(devScript).toContain("MODEL_LIBRARY_DEV_SERVER_URL");
    expect(devScript).toContain("ready in");
    expect(devScript).toContain("Vite exited before Electron started");
    expect(mainSource).toContain("process.env.MODEL_LIBRARY_DEV_SERVER_URL");
  });

  it("reuses the stable port only when it belongs to the same checkout", async () => {
    const devScript = await readFile("scripts/electron-dev.cjs", "utf8");
    const viteConfig = await readFile("vite.config.ts", "utf8");

    expect(devScript).toContain("getRunningProjectId");
    expect(devScript).toContain("createProjectId");
    expect(devScript).toContain("Refusing to reuse a Vite server from another checkout");
    expect(viteConfig).toContain('server.middlewares.use("/__model_library_dev_identity"');
    expect(viteConfig).toContain("createProjectId");
  });
});
