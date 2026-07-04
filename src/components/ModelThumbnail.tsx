import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds } from "@react-three/drei";
import { Box } from "lucide-react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import type { ModelFile } from "../shared/types";

type ModelThumbnailProps = {
  model: ModelFile;
};

export function ModelThumbnail({ model }: ModelThumbnailProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [modelBytes, setModelBytes] = useState<ArrayBuffer | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const element = rootRef.current;

    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "260px" }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || modelBytes || loadFailed) {
      return;
    }

    let isMounted = true;

    window.modelLibrary
      .readModelFile(model.absolutePath)
      .then((bytes) => {
        if (isMounted) {
          setModelBytes(bytes);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadFailed(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isVisible, loadFailed, model.absolutePath, modelBytes]);

  const parsedModel = useMemo(() => {
    if (!modelBytes) {
      return null;
    }

    try {
      if (model.extension === ".stl") {
        const geometry = new STLLoader().parse(modelBytes);
        geometry.computeVertexNormals();
        geometry.center();
        return (
          <mesh geometry={geometry}>
            <meshStandardMaterial color="#78aaa6" roughness={0.68} metalness={0.05} />
          </mesh>
        );
      }

      const group = new ThreeMFLoader().parse(modelBytes);
      centerObject(group);
      return <primitive object={group} />;
    } catch {
      return null;
    }
  }, [model.extension, modelBytes]);

  return (
    <div className="model-thumb" ref={rootRef}>
      {parsedModel ? (
        <Canvas camera={{ position: [65, 54, 78], fov: 42 }} frameloop="demand">
          <color attach="background" args={["#dfe6e8"]} />
          <ambientLight intensity={0.82} />
          <directionalLight position={[60, 80, 50]} intensity={1.2} />
          <Bounds fit clip observe margin={1.25}>
            {parsedModel}
          </Bounds>
        </Canvas>
      ) : (
        <div className="thumb-fallback">
          <Box size={30} />
          <span>{model.extension.toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}

function centerObject(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  box.getCenter(center);
  object.position.sub(center);
}
