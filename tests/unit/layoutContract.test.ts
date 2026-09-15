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

    expect(css).toMatch(/\.model-card,\s*\n\.folder-card\s*\{[\s\S]*?height:\s*238px;/);
    expect(css).toContain("grid-template-rows: 130px 108px");
    expect(css).toContain("-webkit-line-clamp: 2");
    expect(css).toContain(".model-card-meta strong");
    expect(css).toMatch(/\.card-tags\s*\{[\s\S]*?overflow:\s*hidden;/);
  });

  it("virtualizes only collection rows inside the existing scrolling panel", async () => {
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const css = await readFile("src/styles.css", "utf8");

    expect(gridSource).toContain("useVirtualizer");
    expect(gridSource).toContain("buildVirtualRows");
    expect(gridSource).toContain("overscan: 2");
    expect(gridSource).toContain("getScrollElement: () => scrollElementRef.current");
    expect(css).toContain(".virtual-collection-row");
  });

  it("keeps the sticky toolbar and deep folder tree inside their panels", async () => {
    const css = await readFile("src/styles.css", "utf8");
    const folderTreeSource = await readFile("src/components/FolderTree.tsx", "utf8");

    expect(css).toMatch(/\.sidebar\s*\{[\s\S]*?overflow-x:\s*hidden;/);
    expect(css).toContain("scrollbar-gutter: stable");
    expect(css).toContain("--folder-indent");
    expect(css).toMatch(/\.drop-cue\s*\{[\s\S]*?position:\s*absolute;/);
    expect(css).toContain(".folder-tree-row.drag-target-ready");
    expect(css).toContain(".toolbar > :first-child");
    expect(css).toContain(".library-sticky-header");
    expect(css).toContain("--library-padding");
    expect(css).toContain("top: calc(0px - var(--library-padding));");
    expect(css).toMatch(/\.breadcrumbs\s*\{[\s\S]*?overflow-x:\s*auto;/);
    expect(folderTreeSource).toContain('"--folder-indent"');
    expect(folderTreeSource).toContain("drag-target-ready");
    expect(folderTreeSource).not.toContain("paddingLeft: 10 + depth * 14");
  });

  it("reserves toolbar status space and collapses diagnostics responsively", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const settingsSource = await readFile("src/components/SettingsDialog.tsx", "utf8");
    const css = await readFile("src/styles.css", "utf8");

    expect(gridSource).toContain("ThumbnailQueueStatus");
    expect(gridSource).toContain('className="toolbar-statuses"');
    expect(css).toMatch(/\.toolbar-statuses\s*\{[\s\S]*?height:\s*18px;/);
    expect(css).toMatch(/\.thumbnail-queue-status\.complete i\s*\{[\s\S]*?background:\s*var\(--accent\);/);
    expect(css).toMatch(/\.thumbnail-queue-status\.failed\s*\{[\s\S]*?color:\s*var\(--warn\);/);
    expect(css).toMatch(/\.thumbnail-queue-status\.failed i\s*\{[\s\S]*?background:\s*var\(--warn\);/);
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*?\.diagnostics-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(settingsSource).toContain('type SettingsTab = "library" | "organization" | "integrations" | "diagnostics"');
    expect(settingsSource).toContain("Desempenho");
    expect(appSource).toContain("modelThumbnailService.subscribe(setThumbnailDiagnostics)");
    expect(appSource).toContain("observeThumbnailLongTasks(modelThumbnailService)");
    expect(appSource).toContain("longTaskObserver.start()");
    expect(appSource).toContain("longTaskObserver.stop()");
  });

  it("bounds filter popovers inside the responsive filter area", async () => {
    const css = await readFile("src/styles.css", "utf8");

    expect(css).toMatch(/\.file-type-popover\s*\{[\s\S]*?max-height:\s*min\(520px, calc\(100vh - 32px\)\);/);
    expect(css).toMatch(/\.filter-bar\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
  });

  it("keeps search, filters, and active chips in one opaque sticky stacking context", async () => {
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const css = await readFile("src/styles.css", "utf8");
    const stickyHeader = gridSource.match(
      /<div className="library-sticky-header">[\s\S]*?\n      \{scanErrors/
    )?.[0];

    expect(stickyHeader).toBeTruthy();
    expect(stickyHeader).toContain('className="search-box"');
    expect(stickyHeader).toContain('className="filter-bar"');
    expect(stickyHeader).toContain('className="exclusion-filter-row"');
    expect(stickyHeader).toContain('className="tag-filter-row"');
    expect(stickyHeader).toContain('selectedTags.has(tag) ? "active" : ""');
    expect(css).toMatch(/\.library-sticky-header\s*\{[\s\S]*?z-index:\s*20;/);
    expect(css).toMatch(/\.library-sticky-header\s*\{[\s\S]*?isolation:\s*isolate;/);
    expect(css).toMatch(/\.library-sticky-header\s*\{[\s\S]*?background:\s*var\(--panel\);/);
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*?\.toolbar-actions\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
  });

  it("reflows the library header without overlapping labels or controls", async () => {
    const gridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const css = await readFile("src/styles.css", "utf8");

    expect(gridSource).toContain('className="library-heading"');
    expect(gridSource).toContain('className="toolbar-actions"');
    expect(gridSource).toContain('className="toolbar-statuses"');
    expect(css).toMatch(/\.library-heading\s*\{[\s\S]*?min-width:\s*0;/);
    expect(css).toMatch(/\.library-heading h2\s*\{[\s\S]*?font-size:\s*24px;/);
    expect(css).toMatch(/\.toolbar-actions\s*\{[\s\S]*?min-width:\s*0;/);
    expect(css).toMatch(/\.responsive-panel-controls \.icon-only\s*\{[\s\S]*?width:\s*36px;/);
    expect(css).toContain("@media (max-width: 1179px)");
    expect(css).toContain("@media (max-width: 899px)");
  });
});
