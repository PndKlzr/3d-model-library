import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("layout scroll contract", () => {
  it("keeps the main shell fixed with independent panel scrolling", async () => {
    const css = await readFile("src/styles.css", "utf8");

    expect(css).toContain(".app-shell");
    expect(css).toContain("height: 100vh;");
    expect(css).toContain("overflow: hidden;");
    expect(css).toContain(".sidebar");
    expect(css).toContain(".library-panel");
    expect(css).toContain(".details-panel");
    expect(css).toContain("overflow-y: auto;");
  });

  it("keeps thumbnail media separate from readable card names", async () => {
    const css = await readFile("src/styles.css", "utf8");

    expect(css).toContain("grid-template-rows: 130px minmax(64px, auto)");
    expect(css).toContain("-webkit-line-clamp: 2");
    expect(css).toContain(".model-card-meta strong");
  });
});
