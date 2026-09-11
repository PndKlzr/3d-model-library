import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { parseThreeMfPreview } from "./threeMfPreview";
import { parseObjPreview } from "./objPreview";
import { orientModelForBed } from "./modelOrientation";
import type { ModelFile } from "../shared/types";

const THUMBNAIL_WIDTH = 260;
const THUMBNAIL_HEIGHT = 180;
let sharedRenderer: THREE.WebGLRenderer | null = null;

export function renderThumbnail(extension: ModelFile["extension"], modelBytes: ArrayBuffer) {
  const renderer = getSharedRenderer();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT, 0.1, 10000);

  try {
    const object = createThumbnailObject(extension, modelBytes);
    scene.add(new THREE.AmbientLight("#ffffff", 0.78));
    const keyLight = new THREE.DirectionalLight("#ffffff", 1.25);
    keyLight.position.set(80, 120, 90);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#d6ecea", 0.35);
    fillLight.position.set(-70, -30, -60);
    scene.add(fillLight);

    scene.add(object);
    fitCamera(camera, object);

    const box = new THREE.Box3().setFromObject(object);
    const gridSize = Math.max(50, Math.max(...box.getSize(new THREE.Vector3()).toArray()) * 1.8);
    const grid = new THREE.GridHelper(gridSize, 10, "#9eb2b5", "#d1dbde");
    grid.position.y = 0;
    scene.add(grid);

    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/webp", 0.78);
  } catch (error) {
    resetSharedRenderer();
    throw error;
  } finally {
    disposeObject(scene);
    scene.clear();
  }
}

function getSharedRenderer() {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    sharedRenderer.setPixelRatio(1);
    sharedRenderer.setSize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, false);
    sharedRenderer.setClearColor("#edf2f3", 1);
  }
  return sharedRenderer;
}

function resetSharedRenderer() {
  sharedRenderer?.dispose();
  sharedRenderer = null;
}

function createThumbnailObject(extension: ModelFile["extension"], modelBytes: ArrayBuffer) {
  if (extension === ".stl") {
    const geometry = new STLLoader().parse(modelBytes);
    geometry.computeVertexNormals();
    return orientModelForBed(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: "#78aaa6",
      roughness: 0.62,
      metalness: 0.08
    })));
  }
  if (extension === ".3mf") {
    return orientModelForBed(parseThreeMfPreview(modelBytes, { center: false }));
  }
  if (extension === ".obj") {
    return orientModelForBed(parseObjPreview(modelBytes));
  }
  throw new Error("Arquivo sem thumbnail 3D.");
}

function fitCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D) {
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const distance = maxDimension / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const targetY = size.y / 2;
  camera.position.set(distance * 0.72, targetY + distance * 0.58, distance * 1.35);
  camera.near = Math.max(0.1, distance / 100);
  camera.far = distance * 100;
  camera.lookAt(0, targetY, 0);
  camera.updateProjectionMatrix();
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    }
  });
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material.dispose();
}
