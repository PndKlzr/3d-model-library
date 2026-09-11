import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelCardThumbnail } from "../../src/components/ModelCardThumbnail";
import type { ModelFile } from "../../src/shared/types";

const thumbnailService = vi.hoisted(() => ({
  request: vi.fn(),
  setPriority: vi.fn(),
  release: vi.fn()
}));

vi.mock("../../src/lib/modelThumbnailService", () => ({
  modelThumbnailService: {
    request: thumbnailService.request
  }
}));

let observerCallback: IntersectionObserverCallback;
const observe = vi.fn();
const disconnect = vi.fn();

class IntersectionObserverMock {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }

  observe = observe;
  disconnect = disconnect;
}

describe("ModelCardThumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    thumbnailService.request.mockReturnValue({
      promise: Promise.resolve(null),
      setPriority: thumbnailService.setPriority,
      release: thumbnailService.release
    });
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  });

  it("keeps one handle per signature and makes selection dominate visibility", () => {
    const target = model();
    const view = render(<ModelCardThumbnail model={target} selected />);

    expect(thumbnailService.request).toHaveBeenCalledOnce();
    expect(thumbnailService.request).toHaveBeenCalledWith(target, "selected");

    notifyIntersection(false);
    expect(thumbnailService.setPriority).toHaveBeenLastCalledWith("selected");

    view.rerender(<ModelCardThumbnail model={{ ...target }} selected={false} />);
    expect(thumbnailService.request).toHaveBeenCalledOnce();
    expect(thumbnailService.setPriority).toHaveBeenLastCalledWith("nearby");

    notifyIntersection(true);
    expect(thumbnailService.setPriority).toHaveBeenLastCalledWith("visible");

    view.rerender(<ModelCardThumbnail model={target} selected />);
    view.rerender(<ModelCardThumbnail model={target} selected={false} />);
    expect(thumbnailService.request).toHaveBeenCalledOnce();
    expect(thumbnailService.setPriority).toHaveBeenLastCalledWith("visible");

    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(thumbnailService.release).toHaveBeenCalledOnce();
  });

  it("uses an image fallback and keeps loaded images non-draggable", async () => {
    let resolveThumbnail!: (value: string | null) => void;
    const thumbnailPromise = new Promise<string | null>((resolve) => {
      resolveThumbnail = resolve;
    });
    thumbnailService.request.mockReturnValue({
      promise: thumbnailPromise,
      setPriority: thumbnailService.setPriority,
      release: thumbnailService.release
    });
    const target = model({
      name: "photo.jpeg",
      extension: ".jpeg",
      absolutePath: "C:\\Models\\photo.jpeg"
    });
    const view = render(<ModelCardThumbnail model={target} selected={false} />);

    expect(view.container.querySelector(".image-thumb-fallback svg")).not.toBeNull();
    await act(async () => resolveThumbnail("data:image/jpeg;base64,AAAA"));
    const image = view.container.querySelector("img");
    expect(image?.getAttribute("draggable")).toBe("false");
    expect(image?.getAttribute("src")).toBe("data:image/jpeg;base64,AAAA");

    fireEvent.error(image!);
    expect(view.container.querySelector(".image-thumb-fallback svg")).not.toBeNull();
  });
});

function notifyIntersection(isIntersecting: boolean) {
  act(() => {
    observerCallback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

function model(overrides: Partial<ModelFile> = {}): ModelFile {
  return {
    id: "model-1",
    name: "model.stl",
    extension: ".stl",
    absolutePath: "C:\\Models\\model.stl",
    relativeFolder: "",
    sizeBytes: 1024,
    modifiedAt: "2026-09-10T12:00:00.000Z",
    dimensionsMm: null,
    objectCount: null,
    previewError: null,
    ...overrides
  };
}
