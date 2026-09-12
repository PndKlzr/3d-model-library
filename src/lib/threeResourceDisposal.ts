import * as THREE from "three";

export function disposeObjectResources(
  object: THREE.Object3D,
  options: { preserve?: THREE.Object3D } = {}
) {
  const resources = collectObjectResources(object);
  if (options.preserve) subtractResources(resources, collectObjectResources(options.preserve));
  disposeResources(resources);
}

export function disposeMaterials(materials: Iterable<THREE.Material>) {
  const resources = createResourceCollection();
  for (const material of materials) collectMaterial(resources, material);
  disposeResources(resources);
}

type ResourceCollection = {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  textures: Set<THREE.Texture>;
};

function collectObjectResources(object: THREE.Object3D) {
  const resources = createResourceCollection();
  object.traverse((child) => {
    const renderable = child as THREE.Object3D & {
      geometry?: unknown;
      material?: THREE.Material | THREE.Material[];
    };
    if (renderable.geometry instanceof THREE.BufferGeometry) {
      resources.geometries.add(renderable.geometry);
    }
    if (renderable.material) {
      const materials = Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material];
      materials.forEach((material) => collectMaterial(resources, material));
    }
  });
  return resources;
}

function collectMaterial(resources: ResourceCollection, material: THREE.Material) {
  resources.materials.add(material);
  for (const value of Object.values(material)) collectTextureValue(resources.textures, value);
  if (material instanceof THREE.ShaderMaterial) {
    for (const uniform of Object.values(material.uniforms)) {
      collectTextureValue(resources.textures, uniform?.value);
    }
  }
}

function collectTextureValue(textures: Set<THREE.Texture>, value: unknown) {
  if (value instanceof THREE.Texture) textures.add(value);
  else if (Array.isArray(value)) {
    value.forEach((item) => {
      if (item instanceof THREE.Texture) textures.add(item);
    });
  }
}

function createResourceCollection(): ResourceCollection {
  return { geometries: new Set(), materials: new Set(), textures: new Set() };
}

function subtractResources(target: ResourceCollection, preserved: ResourceCollection) {
  preserved.geometries.forEach((item) => target.geometries.delete(item));
  preserved.materials.forEach((item) => target.materials.delete(item));
  preserved.textures.forEach((item) => target.textures.delete(item));
}

function disposeResources(resources: ResourceCollection) {
  resources.textures.forEach((texture) => texture.dispose());
  resources.materials.forEach((material) => material.dispose());
  resources.geometries.forEach((geometry) => geometry.dispose());
}
