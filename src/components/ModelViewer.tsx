import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import { RotateCcw } from "lucide-react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { parseThreeMfPreview } from "../lib/threeMfPreview";
import { parseObjPreview } from "../lib/objPreview";
import { orientModelForBed } from "../lib/modelOrientation";
import type { ModelFile } from "../shared/types";
import {
  isObjSourceSizeWithinBudget,
  OBJ_PREVIEW_LIMIT_ERROR
} from "../shared/objPreviewBudget";
import { disposeObjectResources } from "../lib/threeResourceDisposal";

type ModelViewerProps = {
  model: ModelFile;
};

export function ModelViewer({ model }: ModelViewerProps) {
  const [modelBytes, setModelBytes] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parsedModel, setParsedModel] = useState<THREE.Object3D | { error: string } | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setModelBytes(null);
    setLoadError(null);

    if (model.extension === ".obj" && !isObjSourceSizeWithinBudget(model.sizeBytes)) {
      setLoadError(OBJ_PREVIEW_LIMIT_ERROR);
      return () => {
        isMounted = false;
      };
    }

    window.modelLibrary
      .readModelFile(model.absolutePath)
      .then((bytes) => {
        if (isMounted) {
          setModelBytes(bytes);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [model.absolutePath, model.extension, model.sizeBytes]);

  useEffect(() => {
    setParsedModel(null);
    if (!modelBytes) {
      return;
    }

    let object: THREE.Object3D | null = null;
    try {
      object = parseModelForViewer(model.extension, modelBytes);
      setParsedModel(object);
    } catch (error) {
      setParsedModel({
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return () => {
      if (object) disposeObjectResources(object);
    };
  }, [model.extension, modelBytes]);

  if (loadError) {
    return <div className="viewer-message">{loadError}</div>;
  }

  if (!modelBytes) {
    return <div className="viewer-message">Carregando preview...</div>;
  }

  if (parsedModel && "error" in parsedModel) {
    return <div className="viewer-message">{parsedModel.error}</div>;
  }

  return (
    <div className="viewer-wrap" onContextMenu={(event) => event.preventDefault()}>
      <button
        className="viewer-reset"
        type="button"
        onClick={() => setResetKey((current) => current + 1)}
        aria-label="Resetar visualização"
        title="Resetar visualização"
      >
        <RotateCcw size={16} />
      </button>
      <Canvas
        key={resetKey}
        camera={{ position: [90, 70, 110], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#edf2f3"]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[80, 120, 70]} intensity={1.3} castShadow />
        <directionalLight position={[-70, -40, -60]} intensity={0.3} />
        <Bounds fit clip observe margin={1.2}>
          {parsedModel instanceof THREE.Object3D ? <primitive object={parsedModel} /> : null}
        </Bounds>
        <gridHelper args={[160, 16, "#9eb2b5", "#d1dbde"]} />
        <OrbitControls
          makeDefault
          enableDamping
          enablePan
          enableZoom
          dampingFactor={0.08}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
          }}
        />
      </Canvas>
    </div>
  );
}

function parseModelForViewer(extension: ModelFile["extension"], modelBytes: ArrayBuffer) {
  if (extension === ".stl") {
    const geometry = new STLLoader().parse(modelBytes);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: "#78aaa6",
        roughness: 0.62,
        metalness: 0.08
      })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return orientModelForBed(mesh);
  }

  if (extension === ".obj") {
    return orientModelForBed(parseObjPreview(modelBytes));
  }

  if (extension === ".3mf") {
    return orientModelForBed(parseThreeMfPreview(modelBytes, { center: false }));
  }

  throw new Error("Este arquivo não possui preview 3D.");
}
