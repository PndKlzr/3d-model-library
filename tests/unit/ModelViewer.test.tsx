import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { ModelViewer } from "../../src/components/ModelViewer";
import { OBJ_PREVIEW_BUDGET, OBJ_PREVIEW_LIMIT_ERROR } from "../../src/shared/objPreviewBudget";
import type { ModelFile } from "../../src/shared/types";

const objPreview = vi.hoisted(() => ({ parse: vi.fn() }));

vi.mock("@react-three/fiber", () => ({
  Canvas: () => <div data-testid="canvas" />
}));
vi.mock("@react-three/drei", () => ({
  Bounds: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OrbitControls: () => null
}));
vi.mock("../../src/lib/objPreview", () => ({ parseObjPreview: objPreview.parse }));

describe("ModelViewer OBJ lifecycle", () => {
  const readModelFile = vi.fn();
  const readObjPreviewFile = vi.fn();
  let createdObjects: Array<{
    object: THREE.Group;
    geometryDispose: ReturnType<typeof vi.fn>;
    materialDispose: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(() => {
    vi.clearAllMocks();
    createdObjects = [];
    readModelFile.mockResolvedValue(objBytes());
    readObjPreviewFile.mockResolvedValue(objBytes());
    objPreview.parse.mockImplementation(() => {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.MeshStandardMaterial();
      const geometryDispose = vi.spyOn(geometry, "dispose");
      const materialDispose = vi.spyOn(material, "dispose");
      const object = new THREE.Group();
      object.add(new THREE.Mesh(geometry, material));
      createdObjects.push({ object, geometryDispose, materialDispose });
      return object;
    });
    Object.defineProperty(window, "modelLibrary", {
      configurable: true,
      value: {
        readModelFile,
        getCurrentLibrary: vi.fn(async () => ({
          session: { rootPath: "C:\\Models", libraryId: "library-a", generation: 1 }
        })),
        readObjPreviewFile
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the bounded real-file read when OBJ metadata is stale and oversized", async () => {
    render(<ModelViewer model={model({
      sizeBytes: OBJ_PREVIEW_BUDGET.maxSourceBytes + 1
    })} />);

    expect(await screen.findByTestId("canvas")).toBeTruthy();
    expect(readModelFile).not.toHaveBeenCalled();
    expect(readObjPreviewFile).toHaveBeenCalled();
  });

  it("shows the real-file limit rejection returned by the main process", async () => {
    readObjPreviewFile.mockRejectedValueOnce(new Error(OBJ_PREVIEW_LIMIT_ERROR));

    render(<ModelViewer model={model({ sizeBytes: 1 })} />);

    expect(await screen.findByText(OBJ_PREVIEW_LIMIT_ERROR)).toBeTruthy();
    expect(readModelFile).not.toHaveBeenCalled();
  });

  it("disposes resources on model change and unmount without releasing the active object early", async () => {
    const view = render(<StrictMode><ModelViewer model={model()} /></StrictMode>);

    await waitFor(() => expect(createdObjects).toHaveLength(1));
    expect(readObjPreviewFile).toHaveBeenCalledWith(
      { rootPath: "C:\\Models", libraryId: "library-a", generation: 1 },
      "C:\\Models\\shape.obj"
    );
    expect(readModelFile).not.toHaveBeenCalled();
    expect(createdObjects[0].geometryDispose).not.toHaveBeenCalled();

    view.rerender(<StrictMode><ModelViewer model={model({
      id: "next-obj",
      absolutePath: "C:\\Models\\next.obj"
    })} /></StrictMode>);
    await waitFor(() => expect(createdObjects).toHaveLength(2));
    expect(createdObjects[0].geometryDispose).toHaveBeenCalledOnce();
    expect(createdObjects[1].geometryDispose).not.toHaveBeenCalled();

    view.unmount();
    expect(createdObjects[1].geometryDispose).toHaveBeenCalledOnce();
    expect(createdObjects[1].materialDispose).toHaveBeenCalledOnce();
  });
});

function model(overrides: Partial<ModelFile> = {}): ModelFile {
  return {
    id: "obj",
    name: "shape.obj",
    extension: ".obj",
    absolutePath: "C:\\Models\\shape.obj",
    relativeFolder: "",
    sizeBytes: 128,
    modifiedAt: "2026-09-11T12:00:00.000Z",
    dimensionsMm: null,
    objectCount: null,
    previewError: null,
    ...overrides
  };
}

function objBytes() {
  return new TextEncoder().encode([
    "o triangle",
    "v 0 0 0",
    "v 1 0 0",
    "v 0 1 0",
    "f 1 2 3"
  ].join("\n")).buffer;
}
