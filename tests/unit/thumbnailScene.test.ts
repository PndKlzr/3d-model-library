import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { renderThumbnailScene } from "../../src/lib/thumbnailRenderer";

describe("thumbnail scene", () => {
  it("renders a bed-oriented STL with the same camera and lighting", () => {
    let sceneHasGrid = false;
    let sceneHasGroup = false;
    let cameraAspect = 0;
    const render = vi.fn((scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
      sceneHasGrid = scene.children.some((child) => child instanceof THREE.GridHelper);
      sceneHasGroup = scene.children.some((child) => child instanceof THREE.Group);
      cameraAspect = camera.aspect;
    });
    const renderer = { render } as unknown as THREE.WebGLRenderer;
    const bytes = new TextEncoder().encode([
      "solid part",
      "facet normal 0 0 1",
      "outer loop",
      "vertex 0 0 0",
      "vertex 10 0 0",
      "vertex 0 10 0",
      "endloop",
      "endfacet",
      "endsolid part"
    ].join("\n")).buffer;

    renderThumbnailScene(renderer, ".stl", bytes);

    expect(render).toHaveBeenCalledOnce();
    expect(sceneHasGrid).toBe(true);
    expect(sceneHasGroup).toBe(true);
    expect(cameraAspect).toBeCloseTo(260 / 180);
  });
});
