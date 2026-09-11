import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FolderCardThumbnail } from "../../src/components/FolderCardThumbnail";
import type { ModelFile } from "../../src/shared/types";

const requestThumbnail = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/modelThumbnailService", () => ({
  modelThumbnailService: {
    request: requestThumbnail
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

describe("FolderCardThumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  });

  it("releases every outstanding request when unmounted before thumbnails settle", async () => {
    const requests = Array.from({ length: 4 }, createPendingRequest);
    for (const request of requests) requestThumbnail.mockReturnValueOnce(request);

    const view = render(
      <FolderCardThumbnail models={Array.from({ length: 5 }, (_, index) => model(index))} />
    );

    notifyIntersection(true);

    expect(requestThumbnail).toHaveBeenCalledTimes(4);
    expect(requestThumbnail.mock.calls.every(([, priority]) => priority === "mosaic")).toBe(true);
    for (const request of requests) expect(request.release).not.toHaveBeenCalled();

    view.unmount();

    expect(disconnect).toHaveBeenCalled();
    for (const request of requests) expect(request.release).toHaveBeenCalledOnce();

    await act(async () => {
      for (const request of requests) request.resolve(null);
    });
    for (const request of requests) expect(request.release).toHaveBeenCalledOnce();
  });

  it("renders a successful mosaic and releases settled requests", async () => {
    const requests = Array.from({ length: 4 }, createPendingRequest);
    for (const request of requests) requestThumbnail.mockReturnValueOnce(request);

    const view = render(
      <FolderCardThumbnail models={Array.from({ length: 4 }, (_, index) => model(index))} />
    );

    notifyIntersection(true);
    await act(async () => {
      requests.forEach((request, index) => request.resolve(`data:image/png;base64,${index}`));
    });

    expect(
      [...view.container.querySelectorAll(".folder-thumbnail-mosaic img")].map((image) =>
        image.getAttribute("src")
      )
    ).toEqual([
      "data:image/png;base64,0",
      "data:image/png;base64,1",
      "data:image/png;base64,2",
      "data:image/png;base64,3"
    ]);
    for (const request of requests) expect(request.release).toHaveBeenCalledOnce();

    view.unmount();
    for (const request of requests) expect(request.release).toHaveBeenCalledOnce();
  });

  it("requests model and image thumbnails but skips archives", () => {
    const requests = Array.from({ length: 3 }, createPendingRequest);
    for (const request of requests) requestThumbnail.mockReturnValueOnce(request);
    render(<FolderCardThumbnail models={[
      model(0),
      model(1, { extension: ".zip" }),
      model(2, { extension: ".jpg" }),
      model(3, { extension: ".rar" }),
      model(4, { extension: ".3mf" })
    ]} />);

    notifyIntersection(true);

    expect(requestThumbnail.mock.calls.map(([target]) => target.extension))
      .toEqual([".stl", ".jpg", ".3mf"]);
    expect(requestThumbnail.mock.calls.every(([, priority]) => priority === "mosaic")).toBe(true);
  });
});

function notifyIntersection(isIntersecting: boolean) {
  act(() => {
    observerCallback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

function createPendingRequest() {
  let resolve!: (value: string | null) => void;
  const promise = new Promise<string | null>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {
    promise,
    resolve,
    setPriority: vi.fn(),
    release: vi.fn()
  };
}

function model(index: number, overrides: Partial<ModelFile> = {}): ModelFile {
  return {
    id: `model-${index}`,
    name: `model-${index}.stl`,
    extension: ".stl",
    absolutePath: `C:\\Models\\model-${index}.stl`,
    relativeFolder: "",
    sizeBytes: 1024 + index,
    modifiedAt: "2026-09-10T12:00:00.000Z",
    dimensionsMm: null,
    objectCount: null,
    previewError: null,
    ...overrides
  };
}
