import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { disposeObjectResources } from "../../src/lib/threeResourceDisposal";

describe("disposeObjectResources", () => {
  it("deduplicates shared geometry, material, and texture disposal", () => {
    const geometry = new THREE.BufferGeometry();
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");

    disposeObjectResources(root);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });

  it("preserves resources still owned by a retained object", () => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial();
    const retained = new THREE.Group();
    retained.add(new THREE.Mesh(geometry, material));
    const discarded = new THREE.Group();
    discarded.add(new THREE.Line(geometry, material));
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");

    disposeObjectResources(discarded, { preserve: retained });

    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it("disposes resources from meshes, lines, line segments, and points exactly once", () => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial();
    const root = new THREE.Group();
    root.add(
      new THREE.Mesh(geometry, material),
      new THREE.Line(geometry, material),
      new THREE.LineSegments(geometry, material),
      new THREE.Points(geometry, material)
    );
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");

    disposeObjectResources(root);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
