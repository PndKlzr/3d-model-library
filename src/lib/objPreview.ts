import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  assertObjSourceSizeWithinBudget,
  assertObjTextWithinBudget,
  OBJ_PREVIEW_LIMIT_ERROR
} from "../shared/objPreviewBudget";
import { disposeMaterials, disposeObjectResources } from "./threeResourceDisposal";

const OBJ_PREVIEW_ERROR = "Não foi possível carregar o OBJ.";
const NEUTRAL_MATERIAL = {
  color: "#78aaa6",
  roughness: 0.62,
  metalness: 0.08
} as const;

type GeometryGroupRef = {
  start: number;
  count: number;
  materialIndex: number;
  key: number;
};

export function parseObjPreview(modelBytes: ArrayBuffer): THREE.Group {
  let object: THREE.Group | null = null;

  try {
    assertObjSourceSizeWithinBudget(modelBytes.byteLength);
    const source = new TextDecoder("utf-8", { fatal: true }).decode(modelBytes);
    assertObjTextWithinBudget(source);
    if (!source.trim()) throw new Error(OBJ_PREVIEW_ERROR);

    object = new OBJLoader().parse(source);
    const meshes = collectFaceMeshes(object);
    if (meshes.length === 0) throw new Error(OBJ_PREVIEW_ERROR);

    const importedMaterials = new Set<THREE.Material>();
    for (const mesh of meshes) {
      collectMaterials(mesh.material, importedMaterials);
      if (!hasUsableNormals(mesh.geometry)) mesh.geometry.computeVertexNormals();
      mesh.material = new THREE.MeshStandardMaterial(NEUTRAL_MATERIAL);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    disposeMaterials(importedMaterials);
    return object;
  } catch (error) {
    if (object) disposeObjectResources(object);
    if (error instanceof Error && error.message === OBJ_PREVIEW_LIMIT_ERROR) throw error;
    throw new Error(OBJ_PREVIEW_ERROR);
  }
}

function collectFaceMeshes(object: THREE.Group): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const discarded: THREE.Object3D[] = [];
  let invalidGeometry = false;

  object.traverse((child) => {
    if (child instanceof THREE.Line || child instanceof THREE.Points) {
      discarded.push(child);
      return;
    }
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute("position");
    if (!position || position.itemSize < 3 || position.count < 3 || !hasFiniteValues(position)) {
      invalidGeometry = true;
      return;
    }
    if (removeDegenerateTriangles(child.geometry)) meshes.push(child);
    else discarded.push(child);
  });

  if (invalidGeometry) throw new Error(OBJ_PREVIEW_ERROR);
  disposeDiscardedNodes(discarded, object);
  return meshes;
}

function removeDegenerateTriangles(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const elementCount = index?.count ?? position.count;
  const retainedIndices: number[] = [];
  const retainedOffsets: number[] = [];
  const originalGroups = geometry.groups.map((group, key) => ({ ...group, key }));
  const retainedGroups: Array<{ key: number; materialIndex: number } | null> = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();

  for (let offset = 0; offset + 2 < elementCount; offset += 3) {
    const aIndex = index ? index.getX(offset) : offset;
    const bIndex = index ? index.getX(offset + 1) : offset + 1;
    const cIndex = index ? index.getX(offset + 2) : offset + 2;
    if (!isValidVertexIndex(aIndex, position.count) ||
        !isValidVertexIndex(bIndex, position.count) ||
        !isValidVertexIndex(cIndex, position.count)) {
      continue;
    }
    a.fromBufferAttribute(position, aIndex);
    b.fromBufferAttribute(position, bIndex);
    c.fromBufferAttribute(position, cIndex);
    edgeA.subVectors(b, a);
    edgeB.subVectors(c, a);
    if (edgeA.cross(edgeB).lengthSq() <= 0) continue;
    if (index) retainedIndices.push(aIndex, bIndex, cIndex);
    else retainedOffsets.push(offset, offset + 1, offset + 2);
    retainedGroups.push(findTriangleGroup(originalGroups, offset));
  }

  const retainedCount = index ? retainedIndices.length : retainedOffsets.length;
  if (retainedCount === 0) return false;
  if (retainedCount === elementCount) return true;

  if (index) geometry.setIndex(retainedIndices);
  else compactNonIndexedAttributes(geometry, retainedOffsets, position.count);
  rebuildGeometryGroups(geometry, retainedGroups, originalGroups.length > 0);
  geometry.setDrawRange(0, retainedCount);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return true;
}

function findTriangleGroup(
  groups: GeometryGroupRef[],
  triangleOffset: number
) {
  const group = groups.find(({ start, count }) =>
    triangleOffset >= start && triangleOffset + 3 <= start + count
  );
  return group
    ? { key: group.key, materialIndex: group.materialIndex }
    : null;
}

function rebuildGeometryGroups(
  geometry: THREE.BufferGeometry,
  retainedGroups: Array<{ key: number; materialIndex: number } | null>,
  hadGroups: boolean
) {
  geometry.clearGroups();
  if (!hadGroups) return;

  let rangeStart = 0;
  let range = retainedGroups[0] ?? { key: -1, materialIndex: 0 };
  for (let triangle = 1; triangle <= retainedGroups.length; triangle += 1) {
    const next = triangle < retainedGroups.length
      ? retainedGroups[triangle] ?? { key: -1, materialIndex: 0 }
      : null;
    if (next && next.key === range.key && next.materialIndex === range.materialIndex) continue;

    geometry.addGroup(rangeStart * 3, (triangle - rangeStart) * 3, range.materialIndex);
    rangeStart = triangle;
    if (next) range = next;
  }
}

function compactNonIndexedAttributes(
  geometry: THREE.BufferGeometry,
  retainedOffsets: number[],
  originalPositionCount: number
) {
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (attribute.count !== originalPositionCount) {
      geometry.deleteAttribute(name);
      continue;
    }

    const values = new Float32Array(retainedOffsets.length * attribute.itemSize);
    let target = 0;
    for (const sourceIndex of retainedOffsets) {
      for (let component = 0; component < attribute.itemSize; component += 1) {
        values[target++] = attribute.getComponent(sourceIndex, component);
      }
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
  }
  geometry.setIndex(null);
}

function isValidVertexIndex(value: number, vertexCount: number) {
  return Number.isInteger(value) && value >= 0 && value < vertexCount;
}

function disposeDiscardedNodes(nodes: THREE.Object3D[], retainedRoot: THREE.Object3D) {
  if (nodes.length === 0) return;
  const discardedRoot = new THREE.Group();
  nodes.forEach((node) => {
    node.removeFromParent();
    discardedRoot.add(node);
  });
  disposeObjectResources(discardedRoot, { preserve: retainedRoot });
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
