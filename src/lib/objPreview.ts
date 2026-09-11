import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

const OBJ_PREVIEW_ERROR = "Não foi possível carregar o OBJ.";
const NEUTRAL_MATERIAL = {
  color: "#78aaa6",
  roughness: 0.62,
  metalness: 0.08
} as const;

export function parseObjPreview(modelBytes: ArrayBuffer): THREE.Group {
  let object: THREE.Group | null = null;

  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(modelBytes);
    if (!source.trim()) throw new Error(OBJ_PREVIEW_ERROR);

    object = new OBJLoader().parse(source);
    const meshes = collectValidMeshes(object);
    if (meshes.length === 0) throw new Error(OBJ_PREVIEW_ERROR);

    const importedMaterials = new Set<THREE.Material>();
    for (const mesh of meshes) {
      collectMaterials(mesh.material, importedMaterials);
      if (!hasUsableNormals(mesh.geometry)) mesh.geometry.computeVertexNormals();
      mesh.material = new THREE.MeshStandardMaterial(NEUTRAL_MATERIAL);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    importedMaterials.forEach((material) => material.dispose());
    return object;
  } catch {
    if (object) disposeParsedObject(object);
    throw new Error(OBJ_PREVIEW_ERROR);
  }
}

function collectValidMeshes(object: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  let invalidGeometry = false;

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute("position");
    if (!position || position.itemSize < 3 || position.count < 3 || !hasFiniteValues(position)) {
      invalidGeometry = true;
      return;
    }
    meshes.push(child);
  });

  if (invalidGeometry) throw new Error(OBJ_PREVIEW_ERROR);
  return meshes;
}

function hasFiniteValues(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  for (let index = 0; index < attribute.count; index += 1) {
    if (!Number.isFinite(attribute.getX(index)) ||
      !Number.isFinite(attribute.getY(index)) ||
      !Number.isFinite(attribute.getZ(index))) {
      return false;
    }
  }
  return true;
}

function hasUsableNormals(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  return Boolean(normal && position && normal.count === position.count && hasFiniteValues(normal));
}

function collectMaterials(
  material: THREE.Material | THREE.Material[],
  target: Set<THREE.Material>
) {
  if (Array.isArray(material)) material.forEach((item) => target.add(item));
  else target.add(material);
}

function disposeParsedObject(object: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    collectMaterials(child.material, materials);
  });
  materials.forEach((material) => material.dispose());
}
