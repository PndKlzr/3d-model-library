import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("performance contract", () => {
  it("does not auto-render model thumbnails in the grid", async () => {
    const modelGridSource = await readFile("src/components/ModelGrid.tsx", "utf8");
    const cardThumbnailSource = await readFile("src/components/ModelCardThumbnail.tsx", "utf8");
    const thumbnailSource = await readFile("src/lib/modelThumbnailQueue.ts", "utf8");

    expect(modelGridSource).not.toContain("../components/ModelThumbnail");
    expect(modelGridSource).not.toContain("<ModelThumbnail");
    expect(modelGridSource).not.toContain("readModelFile");
    expect(modelGridSource).toContain("ModelCardThumbnail");
    expect(cardThumbnailSource).toContain("readModelThumbnail");
    expect(cardThumbnailSource).toContain("requestRenderedModelThumbnail");
    expect(cardThumbnailSource).not.toContain("setDidQueue");
    expect(thumbnailSource).not.toContain("readModelThumbnail");
    expect(thumbnailSource).toContain("readModelFile");
    expect(thumbnailSource).toContain("pendingJobs");
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
