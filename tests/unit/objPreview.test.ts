import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { parseObjPreview } from "../../src/lib/objPreview";
import {
  OBJ_PREVIEW_BUDGET,
  OBJ_PREVIEW_LIMIT_ERROR
} from "../../src/shared/objPreviewBudget";

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

  it("keeps face meshes and removes line and point renderables", () => {
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const object = parseObjPreview(objBytes([
      "o mixed",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3",
      "o wire",
      "l 1 2",
      "o marker",
      "p 3"
    ]));
    const unwanted: THREE.Object3D[] = [];
    object.traverse((child) => {
      if (child instanceof THREE.Line || child instanceof THREE.Points) unwanted.push(child);
    });

    expect(collectMeshes(object)).toHaveLength(1);
    expect(unwanted).toHaveLength(0);
    expect(disposeGeometry).toHaveBeenCalled();
  });

  it("does not dispose resources shared by a retained mesh before material replacement", () => {
    const geometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    const texture = new THREE.Texture();
    const importedMaterial = new THREE.MeshBasicMaterial({ map: texture });
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(importedMaterial, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");
    const parsed = new THREE.Group();
    parsed.add(
      new THREE.Mesh(geometry, importedMaterial),
      new THREE.LineSegments(geometry, importedMaterial)
    );
    const loaderParse = vi.spyOn(OBJLoader.prototype, "parse").mockReturnValueOnce(parsed);

    const object = parseObjPreview(objBytes([
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3"
    ]));

    expect(collectMeshes(object)).toHaveLength(1);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    loaderParse.mockRestore();
  });

  it("rejects an OBJ containing only zero-area faces", () => {
    expect(() => parseObjPreview(objBytes([
      "o collapsed",
      "v 1 1 1",
      "f 1 1 1"
    ]))).toThrow(OBJ_ERROR);
  });

  it("drops a degenerate mesh while preserving valid sibling groups", () => {
    const object = parseObjPreview(objBytes([
      "o valid",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3",
      "o collapsed",
      "v 5 5 5",
      "f 4 4 4"
    ]));

    expect(collectMeshes(object).map((mesh) => mesh.name)).toEqual(["valid"]);
  });

  it("keeps a very small triangle when its area is non-zero", () => {
    const object = parseObjPreview(objBytes([
      "o tiny",
      "v 0 0 0",
      "v 0.00001 0 0",
      "v 0 0.00001 0",
      "f 1 2 3"
    ]));

    expect(collectMeshes(object).map((mesh) => mesh.name)).toEqual(["tiny"]);
  });

  it("rejects source bytes above the centralized budget before decoding", () => {
    expect(OBJ_PREVIEW_BUDGET.maxSourceBytes).toBe(64 * 1024 * 1024);
    expect(() => parseObjPreview(
      new ArrayBuffer(OBJ_PREVIEW_BUDGET.maxSourceBytes + 1)
    )).toThrow(OBJ_PREVIEW_LIMIT_ERROR);
  });

  it("rejects excessive textual complexity before OBJLoader parsing", () => {
    const parse = vi.spyOn(OBJLoader.prototype, "parse");
    const excessiveLines = new TextEncoder().encode(
      "\n".repeat(OBJ_PREVIEW_BUDGET.maxLines + 1)
    ).buffer;

    expect(() => parseObjPreview(excessiveLines)).toThrow(OBJ_PREVIEW_LIMIT_ERROR);
    expect(parse).not.toHaveBeenCalled();
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
