import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { orientModelForBed } from "../../src/lib/modelOrientation";
import { parseObjPreview } from "../../src/lib/objPreview";

describe("orientModelForBed", () => {
  it("converts Z-up models to Y-up and places their lowest point on the bed", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 30));
    mesh.position.set(12, 7, 40);

    const oriented = orientModelForBed(mesh);
    const box = new THREE.Box3().setFromObject(oriented);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    expect(size.x).toBeCloseTo(10);
    expect(size.y).toBeCloseTo(30);
    expect(size.z).toBeCloseTo(20);
    expect(box.min.y).toBeCloseTo(0);
    expect(center.x).toBeCloseTo(0);
    expect(center.z).toBeCloseTo(0);
  });

  it("preserves spacing between parts while centering the complete model", () => {
    const source = new THREE.Group();
    const left = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6));
    const right = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6));
    left.position.x = -10;
    right.position.x = 20;
    source.add(left, right);

    const distanceBefore = left.getWorldPosition(new THREE.Vector3()).distanceTo(
      right.getWorldPosition(new THREE.Vector3())
    );
    const oriented = orientModelForBed(source);
    const distanceAfter = left.getWorldPosition(new THREE.Vector3()).distanceTo(
      right.getWorldPosition(new THREE.Vector3())
    );
    const box = new THREE.Box3().setFromObject(oriented);

    expect(distanceAfter).toBeCloseTo(distanceBefore);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.getCenter(new THREE.Vector3()).x).toBeCloseTo(0);
    expect(box.getCenter(new THREE.Vector3()).z).toBeCloseTo(0);
  });

  it("reuses bed orientation for OBJ in both viewer and thumbnail rendering", async () => {
    const [viewerSource, thumbnailSource] = await Promise.all([
      readFile("src/components/ModelViewer.tsx", "utf8"),
      readFile("src/lib/thumbnailRenderer.ts", "utf8")
    ]);

    expect(viewerSource).toMatch(/orientModelForBed\(parseObjPreview\(modelBytes\)\)/);
    expect(thumbnailSource).toMatch(/orientModelForBed\(parseObjPreview\(modelBytes\)\)/);
  });

  it("orients parsed OBJ geometry onto the bed while preserving its dimensions", () => {
    const bytes = new TextEncoder().encode([
      "o upright",
      "v 10 20 30",
      "v 20 20 30",
      "v 10 40 30",
      "v 10 20 60",
      "f 1 2 3",
      "f 1 4 2"
    ].join("\n")).buffer;

    const oriented = orientModelForBed(parseObjPreview(bytes));
    const box = new THREE.Box3().setFromObject(oriented);
    const size = box.getSize(new THREE.Vector3());

    expect(box.min.y).toBeCloseTo(0);
    expect(box.getCenter(new THREE.Vector3()).x).toBeCloseTo(0);
    expect(box.getCenter(new THREE.Vector3()).z).toBeCloseTo(0);
    expect(size.x).toBeCloseTo(10);
    expect(size.y).toBeCloseTo(30);
    expect(size.z).toBeCloseTo(20);
  });
});
