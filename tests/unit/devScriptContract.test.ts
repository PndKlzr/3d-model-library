import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("dev script contract", () => {
  it("keeps Vite on the same fixed port Electron loads", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    const devScript = await readFile("scripts/electron-dev.cjs", "utf8");

    expect(packageJson.scripts.dev).toContain("--strictPort");
    expect(packageJson.scripts["electron:dev"]).toBe("node scripts/electron-dev.cjs");
    expect(devScript).toContain("http://127.0.0.1:5173");
    expect(devScript).toContain("ready in");
    expect(devScript).toContain("Vite exited before Electron started");
  });

  it("starts Electron when the fixed Vite URL is already running", async () => {
    const devScript = await readFile("scripts/electron-dev.cjs", "utf8");

    expect(devScript).toContain("isViteAlreadyRunning");
    expect(devScript).toContain("Existing Vite server detected");
    expect(devScript).toContain("startElectron({ ownsVite: false })");
  });
});
