import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { parseObjPreview } from "../../src/lib/objPreview";

const OBJ_ERROR = "Não foi possível carregar o OBJ.";

describe("parseObjPreview", () => {
  it("parses non-empty OBJ geometry from UTF-8 bytes", () => {
    const object = parseObjPreview(objBytes([
      "o triangle",
      "v 0 0 0",
      "v 20 0 0",
      "v 0 20 0",
      "f 1 2 3"
    ]));

    expect(new THREE.Box3().setFromObject(object).isEmpty()).toBe(false);
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        expect(child.material).toBeInstanceOf(THREE.MeshStandardMaterial);
      }
    });
  });

  it("preserves UTF-8 object names and separate OBJ groups", () => {
    const object = parseObjPreview(objBytes([
      "o peça esquerda",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3",
      "g encaixe direito",
      "v 10 0 0",
      "v 11 0 0",
      "v 10 1 0",
      "f 4 5 6"
    ]));
    const meshes = collectMeshes(object);

    expect(meshes).toHaveLength(2);
    expect(meshes.map((mesh) => mesh.name)).toEqual(["peça esquerda", "encaixe direito"]);
  });

  it("computes absent normals and applies one neutral shadow-ready material per mesh", () => {
    const object = parseObjPreview(objBytes([
      "o triangle",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3"
    ]));
    const [mesh] = collectMeshes(object);
    const material = mesh.material as THREE.MeshStandardMaterial;

    expect(mesh.geometry.getAttribute("normal")).toBeDefined();
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.color.getHexString()).toBe("78aaa6");
    expect(material.roughness).toBeCloseTo(0.62);
    expect(material.metalness).toBeCloseTo(0.08);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
  });

  it("disposes imported OBJ materials when replacing them", () => {
    const dispose = vi.spyOn(THREE.Material.prototype, "dispose");

    parseObjPreview(objBytes([
      "o painted",
      "usemtl exterior",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3"
    ]));

    expect(dispose).toHaveBeenCalled();
  });

  it.each([
    ["empty input", []],
    ["vertices without faces", ["v 0 0 0", "v 1 0 0", "v 0 1 0"]],
    ["malformed faces", ["v 0 0 0", "v 1 0 0", "v 0 1 0", "f 1 2 nope"]]
  ])("rejects %s with a stable error", (_label, lines) => {
    expect(() => parseObjPreview(objBytes(lines))).toThrow(OBJ_ERROR);
  });
});

function objBytes(lines: string[]) {
  return new TextEncoder().encode(lines.join("\n")).buffer;
}

function collectMeshes(object: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}
