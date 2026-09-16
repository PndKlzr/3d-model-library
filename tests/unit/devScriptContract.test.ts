import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("dev script contract", () => {
  it("passes a dedicated Vite URL to the Electron instance it starts", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    const devScript = await readFile("scripts/electron-dev.cjs", "utf8");
    const mainSource = await readFile("electron/main.ts", "utf8");

    expect(packageJson.scripts.dev).toContain("--strictPort");
    expect(packageJson.scripts["electron:dev"]).toBe("node scripts/electron-dev.cjs");
    expect(devScript).toContain("findAvailablePort");
    expect(devScript).toContain("MODEL_LIBRARY_DEV_SERVER_URL");
    expect(devScript).toContain('"--port", String(vitePort)');
    expect(devScript).toContain("ready in");
    expect(devScript).toContain("Vite exited before Electron started");
    expect(mainSource).toContain("process.env.MODEL_LIBRARY_DEV_SERVER_URL");
  });

  it("never reuses an unrelated Vite server from another checkout", async () => {
    const devScript = await readFile("scripts/electron-dev.cjs", "utf8");

    expect(devScript).not.toContain("isViteAlreadyRunning");
    expect(devScript).not.toContain("Existing Vite server detected");
    expect(devScript).not.toContain("ownsVite");
  });
});
