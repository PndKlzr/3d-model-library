import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("performance contract", () => {
  it("does not auto-render model thumbnails in the grid", async () => {
    const modelGridSource = await readFile("src/components/ModelGrid.tsx", "utf8");

    expect(modelGridSource).not.toContain("ModelThumbnail");
    expect(modelGridSource).not.toContain("readModelFile");
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
});
