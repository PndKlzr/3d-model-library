import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("layout scroll contract", () => {
  it("keeps the main shell fixed with independent panel scrolling", async () => {
    const css = await readFile("src/styles.css", "utf8");

    expect(css).toContain(".app-shell");
    expect(css).toContain(
      "grid-template-columns: clamp(220px, 18vw, 260px) minmax(0, 1fr) clamp(300px, 24vw, 360px);"
    );
    expect(css).toContain("height: 100dvh;");
    expect(css).toContain("overflow: hidden;");
    expect(css).toContain(".sidebar");
    expect(css).toContain(".library-panel");
    expect(css).toContain(".details-panel");
    expect(css).toContain("overflow-y: auto;");
  });

  it("keeps dense controls from stealing the model grid at narrower desktop widths", async () => {
    const css = await readFile("src/styles.css", "utf8");

    expect(css).toContain(".tag-filter-row");
    expect(css).toContain("max-height: 72px;");
    expect(css).toContain("overflow-y: auto;");
    expect(css).toContain("@media (max-width: 1100px)");
    expect(css).toContain(".model-list-main .optional-column");
    expect(css).toContain("display: none;");
  });

  it("keeps thumbnail media separate from readable card names", async () => {
    const css = await readFile("src/styles.css", "utf8");

    expect(css).toContain("grid-template-rows: 130px minmax(64px, auto)");
    expect(css).toContain("-webkit-line-clamp: 2");
    expect(css).toContain(".model-card-meta strong");
  });
});
