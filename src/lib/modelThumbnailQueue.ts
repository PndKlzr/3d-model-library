import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { parseThreeMfPreview } from "./threeMfPreview";
import type { ModelFile } from "../shared/types";

const THUMBNAIL_WIDTH = 260;
const THUMBNAIL_HEIGHT = 180;
const thumbnailCache = new Map<string, Promise<string | null>>();
const pendingJobs: Array<() => void> = [];
let activeJobs = 0;

export function requestRenderedModelThumbnail(model: ModelFile): Promise<string | null> {
  const cacheKey = `${model.absolutePath}:${model.modifiedAt}:${model.sizeBytes}`;
  const cached = thumbnailCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const thumbnailPromise = enqueueThumbnailJob(() => generateModelThumbnail(model));
  thumbnailCache.set(cacheKey, thumbnailPromise);
  return thumbnailPromise;
}

function enqueueThumbnailJob(job: () => Promise<string | null>): Promise<string | null> {
  return new Promise((resolve) => {
    pendingJobs.push(() => {
      activeJobs += 1;

      job()
        .then(resolve)
        .catch(() => resolve(null))
        .finally(() => {
          activeJobs -= 1;
          window.setTimeout(runNextThumbnailJob, 40);
        });
    });

    runNextThumbnailJob();
  });
}

function runNextThumbnailJob() {
  if (activeJobs > 0) {
    return;
  }

  pendingJobs.shift()?.();
}

async function generateModelThumbnail(model: ModelFile): Promise<string | null> {
  await waitForIdle();

  const modelBytes = await window.modelLibrary.readModelFile(model.absolutePath);
  await waitForIdle();
  return renderModelThumbnail(model.extension, modelBytes);
}

function waitForIdle(): Promise<void> {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 600 });
      return;
    }

    window.setTimeout(resolve, 32);
  });
}

function renderModelThumbnail(extension: ModelFile["extension"], modelBytes: ArrayBuffer) {
  const object = createThumbnailObject(extension, modelBytes);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT, 0.1, 10000);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
  });

  try {
    renderer.setPixelRatio(1);
    renderer.setSize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, false);
    renderer.setClearColor("#edf2f3", 1);

    scene.add(new THREE.AmbientLight("#ffffff", 0.78));
    const keyLight = new THREE.DirectionalLight("#ffffff", 1.25);
    keyLight.position.set(80, 120, 90);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#d6ecea", 0.35);
    fillLight.position.set(-70, -30, -60);
    scene.add(fillLight);

    centerObject(object);
    scene.add(object);
    fitCamera(camera, object);

    const box = new THREE.Box3().setFromObject(object);
    const gridSize = Math.max(50, Math.max(...box.getSize(new THREE.Vector3()).toArray()) * 1.8);
    const grid = new THREE.GridHelper(gridSize, 10, "#9eb2b5", "#d1dbde");
    grid.position.y = box.min.y;
    scene.add(grid);

    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/webp", 0.78);
  } finally {
    disposeObject(scene);
    renderer.dispose();
  }
}

function createThumbnailObject(extension: ModelFile["extension"], modelBytes: ArrayBuffer) {
  if (extension === ".stl") {
    const geometry = new STLLoader().parse(modelBytes);
    geometry.computeVertexNormals();
    geometry.center();

    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: "#78aaa6",
        roughness: 0.62,
        metalness: 0.08
      })
    );
  }

  if (extension === ".3mf") {
    return parseThreeMfPreview(modelBytes);
  }

  throw new Error("Arquivo sem thumbnail 3D.");
}

function centerObject(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
}

function fitCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = maxDimension / (2 * Math.tan(fov / 2));

  camera.position.set(distance * 0.72, distance * 0.58, distance * 1.35);
  camera.near = Math.max(0.1, distance / 100);
  camera.far = distance * 100;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.geometry.dispose();

    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
      return;
    }

    child.material.dispose();
  });
}
