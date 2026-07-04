import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("dev script contract", () => {
  it("keeps Vite on the same fixed port Electron loads", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));

    expect(packageJson.scripts.dev).toContain("--strictPort");
    expect(packageJson.scripts["electron:dev"]).toContain("--strictPort");
    expect(packageJson.scripts["electron:dev"]).toContain("http://127.0.0.1:5173");
  });
});
