import * as THREE from "three";

const PRINT_SPACE_TO_VIEWER_X_ROTATION = -Math.PI / 2;

export function orientModelForBed(source: THREE.Object3D): THREE.Group {
  const oriented = new THREE.Group();
  oriented.add(source);
  oriented.rotation.x = PRINT_SPACE_TO_VIEWER_X_ROTATION;
  oriented.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(oriented);
  if (box.isEmpty()) return oriented;

  const center = box.getCenter(new THREE.Vector3());
  oriented.position.set(-center.x, -box.min.y, -center.z);
  oriented.updateMatrixWorld(true);
  return oriented;
}
