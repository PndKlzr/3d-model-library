import { useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import { RotateCcw } from "lucide-react";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { parseThreeMfPreview } from "../lib/threeMfPreview";
import type { ModelFile } from "../shared/types";

type ModelViewerProps = {
  model: ModelFile;
  onPreviewImage?: (imageUrl: string) => void;
};

export function ModelViewer({ model, onPreviewImage }: ModelViewerProps) {
  const [modelBytes, setModelBytes] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setModelBytes(null);
    setLoadError(null);

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
  }, [model.absolutePath]);

  const parsedModel = useMemo(() => {
    if (!modelBytes) {
      return null;
    }

    try {
      if (model.extension === ".stl") {
        const geometry = new STLLoader().parse(modelBytes);
        geometry.computeVertexNormals();
        geometry.center();

        return <mesh geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial color="#78aaa6" roughness={0.62} metalness={0.08} />
        </mesh>;
      }

      const group = parseThreeMfPreview(modelBytes);
      return <primitive object={group} />;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }, [model.extension, modelBytes]);

  if (loadError) {
    return <div className="viewer-message">{loadError}</div>;
  }

  if (!modelBytes) {
    return <div className="viewer-message">Carregando preview...</div>;
  }

  if (parsedModel && typeof parsedModel === "object" && "error" in parsedModel) {
    return <div className="viewer-message">{parsedModel.error}</div>;
  }

  return (
    <div className="viewer-wrap">
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
        gl={{ powerPreference: "high-performance", preserveDrawingBuffer: true }}
      >
        <color attach="background" args={["#edf2f3"]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[80, 120, 70]} intensity={1.3} castShadow />
        <directionalLight position={[-70, -40, -60]} intensity={0.3} />
        <Bounds fit clip observe margin={1.2}>
          {parsedModel}
        </Bounds>
        <gridHelper args={[160, 16, "#9eb2b5", "#d1dbde"]} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
        {onPreviewImage ? <PreviewSnapshot onPreviewImage={onPreviewImage} /> : null}
      </Canvas>
    </div>
  );
}

function PreviewSnapshot({ onPreviewImage }: { onPreviewImage: (imageUrl: string) => void }) {
  const { gl, invalidate } = useThree();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      invalidate();
      onPreviewImage(gl.domElement.toDataURL("image/webp", 0.76));
    }, 400);

    return () => window.clearTimeout(timer);
  }, [gl, invalidate, onPreviewImage]);

  return null;
}
