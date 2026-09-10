import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("performance contract", () => {
  it("documents bounded thumbnail memory and reproducible benchmark commands", async () => {
    const readme = await readFile("README.md", "utf8");
    const baseline = await readFile("docs/performance/thumbnail-benchmark-baseline.md", "utf8");
    const scheduler = await readFile("src/lib/thumbnailScheduler.ts", "utf8");

    expect(readme).toContain("npm run benchmark:thumbnails");
    expect(readme).toContain("does not write to the selected library");
    expect(baseline).toContain("Cold thumbnails");
    expect(baseline).toContain("Warm thumbnails");
    expect(baseline).toContain("Scroll stress");
    expect(baseline).toContain("Cached index ready");
    expect(baseline).toContain("Library reconciliation settled");
    expect(baseline).toContain("Thumbnail pass settled");
    expect(baseline).not.toContain("pending");
    expect(baseline).toContain("449 STL/3MF models");
    expect(baseline).not.toContain("Full reconciliation");
    expect(baseline).not.toMatch(/[A-Z]:\\\\Users\\\\/i);
    expect(scheduler).toContain("maxCompletedEntries");
    expect(scheduler).toContain("maxHistoricalJobs");
  });

  it("does not auto-render model thumbnails in the grid", async () => {
    const modelGridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const cardThumbnailSource = await readFile("src/components/ModelCardThumbnail.tsx", "utf8");
    const thumbnailSource = await readFile("src/lib/modelThumbnailService.ts", "utf8");

    expect(modelGridSource).not.toContain("../components/ModelThumbnail");
    expect(modelGridSource).not.toContain("<ModelThumbnail");
    expect(modelGridSource).not.toContain("readModelFile");
    expect(modelGridSource).toContain("ModelCardThumbnail");
    expect(cardThumbnailSource).toContain('from "../lib/modelThumbnailService"');
    expect(cardThumbnailSource).toContain("modelThumbnailService.request(model, initialPriority)");
    expect(cardThumbnailSource).not.toContain("readCachedThumbnail");
    expect(cardThumbnailSource).not.toContain("readModelThumbnail");
    expect(cardThumbnailSource).not.toContain("writeCachedThumbnail");
    expect(cardThumbnailSource).not.toContain("nearbyObserver");
    expect(cardThumbnailSource).not.toContain("setDidQueue");
    expect(thumbnailSource).toContain("readCachedThumbnail");
    expect(thumbnailSource).toContain("readEmbeddedThumbnail");
    expect(thumbnailSource).toContain("writeCachedThumbnail");
    expect(thumbnailSource).toContain("readModelFile");
    expect(thumbnailSource).toContain("ioScheduler");
    expect(thumbnailSource).toContain("renderScheduler");
    expect(thumbnailSource).toContain("renderThumbnail");
    expect(thumbnailSource).toContain("concurrency: 4");
    expect(thumbnailSource).toContain("concurrency: 1");
    expect(cardThumbnailSource).not.toContain('"background"');
    expect(thumbnailSource).toContain("thumbnail ?? null");
  });

  it("gives selected cards priority without changing virtualized render identity", async () => {
    const card = await readFile("src/components/ModelCardThumbnail.tsx", "utf8");
    const grid = await readFile("src/components/ModelGrid.tsx", "utf8");

    expect(card).toContain('selected ? "selected" : "nearby"');
    expect(card).toContain(
      'selectedRef.current ? "selected" : entry.isIntersecting ? "visible" : "nearby"'
    );
    expect(grid).toContain("<ModelCardThumbnail model={model} selected={isSelected}");
    expect(grid).toContain("key={virtualRow.key}");
  });

  it("reuses one GPU renderer for generated thumbnails", async () => {
    const rendererSource = await readFile("src/lib/thumbnailRenderer.ts", "utf8");

    expect(rendererSource).toContain("sharedRenderer");
    expect(rendererSource).toContain('powerPreference: "high-performance"');
    expect(rendererSource).not.toContain("renderer.dispose();\n  }");
  });

  it("bounds file metadata work during recursive scans", async () => {
    const scannerSource = await readFile("electron/services/libraryScanner.ts", "utf8");

    expect(scannerSource).toContain("runBounded");
    expect(scannerSource).toContain("FILE_STAT_CONCURRENCY");
  });

  it("keeps the detail preview isolated from card thumbnails", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");
    const detailsSource = await readFile("src/components/DetailsPanel.tsx", "utf8");
    const viewerSource = await readFile("src/components/ModelViewer.tsx", "utf8");

    expect(appSource).not.toContain("thumbnailUrls");
    expect(appSource).not.toContain("onPreviewImage");
    expect(detailsSource).not.toContain("onPreviewImage");
    expect(viewerSource).not.toContain("PreviewSnapshot");
  });

  it("does not calculate model metadata automatically on selection", async () => {
    const appSource = await readFile("src/App.tsx", "utf8");

    expect(appSource).not.toContain("readModelMetadata");
  });

  it("requires an explicit user action before loading the 3D preview", async () => {
    const detailsSource = await readFile("src/components/DetailsPanel.tsx", "utf8");

    expect(detailsSource).toContain("Carregar preview 3D");
    expect(detailsSource).toContain("showPreview");
  });

  it("uses the tolerant 3MF preview parser instead of ThreeMFLoader", async () => {
    const viewerSource = await readFile("src/components/ModelViewer.tsx", "utf8");

    expect(viewerSource).toContain("parseThreeMfPreview");
    expect(viewerSource).not.toContain("ThreeMFLoader");
  });

  it("uses slicer-style mouse controls in the 3D viewer", async () => {
    const viewerSource = await readFile("src/components/ModelViewer.tsx", "utf8");

    expect(viewerSource).toContain("mouseButtons");
    expect(viewerSource).toContain("LEFT: THREE.MOUSE.PAN");
    expect(viewerSource).toContain("RIGHT: THREE.MOUSE.ROTATE");
    expect(viewerSource).toContain("enableZoom");
  });
});
