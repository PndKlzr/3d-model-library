import { XMLParser, XMLValidator } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate";
import * as THREE from "three";

type ThreeMfVertex = {
  x: number;
  y: number;
  z: number;
};

type ThreeMfTriangle = {
  v1: number;
  v2: number;
  v3: number;
};

type ThreeMfObject = {
  id?: string | number;
  mesh?: {
    vertices?: {
      vertex?: unknown | unknown[];
    };
    triangles?: {
      triangle?: unknown | unknown[];
    };
  };
  components?: {
    component?: ThreeMfComponent | ThreeMfComponent[];
  };
};

type ThreeMfComponent = {
  objectid?: string | number;
  transform?: string;
};

type ThreeMfBuildItem = {
  objectid?: string | number;
  transform?: string;
};

export function parseThreeMfPreview(
  buffer: ArrayBuffer,
  options: { center?: boolean } = {}
): THREE.Group {
  const files = unzipSync(new Uint8Array(buffer));
  const modelFiles = Object.entries(files).filter(([filePath]) =>
    isRenderableModelPath(filePath)
  );
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ""
  });
  const objectById = new Map<string, ThreeMfObject>();
  const buildItems: ThreeMfBuildItem[] = [];
  const group = new THREE.Group();

  for (const [modelPath, modelFile] of modelFiles) {
    const modelXml = strFromU8(modelFile);
    if (XMLValidator.validate(modelXml) !== true) {
      throw new Error("XML 3MF inválido.");
    }
    const parsed = parser.parse(modelXml);

    for (const objectItem of toArray<ThreeMfObject>(parsed?.model?.resources?.object)) {
      if (objectItem.id !== undefined) {
        objectById.set(String(objectItem.id), objectItem);
      }
    }

    if (modelPath.toLowerCase() === "3d/3dmodel.model") {
      buildItems.push(...toArray<ThreeMfBuildItem>(parsed?.model?.build?.item));
    }
  }

  if (buildItems.length > 0) {
    for (const item of buildItems) {
      const object = createObjectInstance(item.objectid, objectById, new Set());

      if (!object) {
        continue;
      }

      applyTransform(object, item.transform);
      group.add(object);
    }
  } else {
    addLooseMeshes(group, objectById);
  }

  if (group.children.length === 0) {
    throw new Error("3MF sem malhas renderizáveis.");
  }

  if (options.center ?? true) {
    centerObject(group);
  }

  return group;
}

function isRenderableModelPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return normalized.startsWith("3d/") && normalized.endsWith(".model") && !normalized.includes("_rels/");
}

function addLooseMeshes(group: THREE.Group, objectById: Map<string, ThreeMfObject>) {
  for (const objectItem of objectById.values()) {
    if (!objectItem.mesh) {
      continue;
    }

    const mesh = createMesh(objectItem);

    if (mesh) {
      group.add(mesh);
    }
  }
}

function createObjectInstance(
  objectId: string | number | undefined,
  objectById: Map<string, ThreeMfObject>,
  objectStack: Set<string>
): THREE.Object3D | null {
  if (objectId === undefined) {
    return null;
  }

  const normalizedId = String(objectId);

  if (objectStack.has(normalizedId)) {
    return null;
  }

  const objectItem = objectById.get(normalizedId);

  if (!objectItem) {
    return null;
  }

  if (objectItem.mesh) {
    return createMesh(objectItem);
  }

  const group = new THREE.Group();
  const nextStack = new Set(objectStack);
  nextStack.add(normalizedId);

  for (const component of toArray<ThreeMfComponent>(objectItem.components?.component)) {
    const componentObject = createObjectInstance(component.objectid, objectById, nextStack);

    if (!componentObject) {
      continue;
    }

    applyTransform(componentObject, component.transform);
    group.add(componentObject);
  }

  return group.children.length > 0 ? group : null;
}

function createMesh(objectItem: ThreeMfObject) {
  const mesh = objectItem.mesh;

  if (!mesh) {
    return null;
  }

  const vertices = toArray<Record<string, unknown>>(mesh.vertices?.vertex).map((vertex) => ({
    x: Number(vertex.x),
    y: Number(vertex.y),
    z: Number(vertex.z)
  }));
  const triangles = toArray<Record<string, unknown>>(mesh.triangles?.triangle).map((triangle) => ({
    v1: Number(triangle.v1),
    v2: Number(triangle.v2),
    v3: Number(triangle.v3)
  }));
  const geometry = buildGeometry(vertices, triangles);

  if (!geometry) {
    return null;
  }

  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: "#78aaa6",
      roughness: 0.62,
      metalness: 0.08
    })
  );
}

function buildGeometry(vertices: ThreeMfVertex[], triangles: ThreeMfTriangle[]) {
  const positions: number[] = [];

  for (const triangle of triangles) {
    const a = vertices[triangle.v1];
    const b = vertices[triangle.v2];
    const c = vertices[triangle.v3];

    if (!isValidVertex(a) || !isValidVertex(b) || !isValidVertex(c)) {
      continue;
    }

    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }

  if (positions.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function isValidVertex(vertex: ThreeMfVertex | undefined): vertex is ThreeMfVertex {
  return Boolean(
    vertex &&
      Number.isFinite(vertex.x) &&
      Number.isFinite(vertex.y) &&
      Number.isFinite(vertex.z)
  );
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function applyTransform(object: THREE.Object3D, transform: string | undefined) {
  const matrix = parseTransform(transform);

  if (matrix) {
    object.applyMatrix4(matrix);
  }
}

function parseTransform(transform: string | undefined) {
  if (!transform) {
    return null;
  }

  const values = transform
    .trim()
    .split(/\s+/)
    .map(Number);

  if (values.length !== 12 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return new THREE.Matrix4().set(
    values[0],
    values[1],
    values[2],
    values[9],
    values[3],
    values[4],
    values[5],
    values[10],
    values[6],
    values[7],
    values[8],
    values[11],
    0,
    0,
    0,
    1
  );
}

function centerObject(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  box.getCenter(center);
  object.position.sub(center);
}
