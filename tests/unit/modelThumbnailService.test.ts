import { describe, expect, it, vi } from "vitest";
import {
  createModelThumbnailService,
  type ModelThumbnailServiceDependencies
} from "../../src/lib/modelThumbnailService";
import type { ModelFile } from "../../src/shared/types";

const WEBP = "data:image/webp;base64,UklGRgAAAABXRUJQ";
const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("modelThumbnailService", () => {
  it("resolves queued requests from the previous library to null", async () => {
    const service = createModelThumbnailService(dependencies());
    service.beginLibrarySession(librarySession("library-a", 1));
    const request = service.request(model(), "visible");

    service.beginLibrarySession(librarySession("library-b", 2));

    await expect(request.promise).resolves.toBeNull();
  });

  it("does not publish or cache an active result from the previous library", async () => {
    const renderGate = deferred<void>();
    const writeCachedThumbnail = vi.fn(async () => undefined);
    const service = createModelThumbnailService(dependencies({
      yieldBeforeRender: () => renderGate.promise,
      writeCachedThumbnail
    }));
    service.beginLibrarySession(librarySession("library-a", 1));
    const request = service.request(model(), "visible");
    await vi.waitFor(() => expect(service.getDiagnostics().running.render).toBe(1));

    service.beginLibrarySession(librarySession("library-b", 2));
    renderGate.resolve(undefined);

    await expect(request.promise).resolves.toBeNull();
    await service.onIdle();
    expect(writeCachedThumbnail).not.toHaveBeenCalled();
    expect(service.getDiagnostics().retainedResults.current).toBe(0);
  });

  it("does not let an old completion delete a new library request for the same model", async () => {
    const firstRenderGate = deferred<void>();
    let renderCount = 0;
    const service = createModelThumbnailService(dependencies({
      yieldBeforeRender: async () => {
        renderCount += 1;
        if (renderCount === 1) await firstRenderGate.promise;
      }
    }));
    service.beginLibrarySession(librarySession("library-a", 1));
    const oldRequest = service.request(model(), "visible");
    await vi.waitFor(() => expect(service.getDiagnostics().running.render).toBe(1));

    service.beginLibrarySession(librarySession("library-b", 2));
    const newRequest = service.request(model(), "visible");
    firstRenderGate.resolve(undefined);

    await expect(oldRequest.promise).resolves.toBeNull();
    await expect(newRequest.promise).resolves.toBe(WEBP);
  });

  it("resets aggregate diagnostics between warm-up and measured passes", async () => {
    const service = createModelThumbnailService(dependencies());

    await service.request(model(), "visible").promise;
    service.recordLongTask(125);
    expect(service.getDiagnostics().renders).toBe(1);

    service.resetDiagnostics();

    expect(service.getDiagnostics()).toMatchObject({
      cacheHits: 0,
      cacheMisses: 0,
      renders: 0,
      failures: 0,
      discardedHistorical: 0,
      longTasks: { count: 0, maximumMs: 0 },
      retainedResults: { current: 0, peak: 0 },
      durationMs: {
        io: { count: 0, average: 0, maximum: 0 },
        render: { count: 0, average: 0, maximum: 0 },
        total: { count: 0, average: 0, maximum: 0 }
      }
    });
  });

  it("clears failed signatures between warm-up and measured passes", async () => {
    let attempts = 0;
    const service = createModelThumbnailService(dependencies({
      renderThumbnail: () => {
        attempts += 1;
        if (attempts === 1) throw new Error("warm-up failure");
        return WEBP;
      }
    }));
    const target = model();

    await expect(service.request(target, "visible").promise).resolves.toBeNull();
    service.resetDiagnostics();
    await expect(service.request(target, "visible").promise).resolves.toBe(WEBP);

    expect(attempts).toBe(2);
    expect(service.getDiagnostics()).toMatchObject({
      cacheMisses: 1,
      renders: 1,
      failures: 0
    });
  });

  it("records a cache miss before a later render failure settles", async () => {
    const renderGate = deferred<void>();
    const service = createModelThumbnailService(dependencies({
      yieldBeforeRender: () => renderGate.promise,
      renderThumbnail: () => {
        throw new Error("broken mesh");
      }
    }));

    const request = service.request(model(), "visible");
    await vi.waitFor(() => expect(service.getDiagnostics().cacheMisses).toBe(1));
    expect(service.getDiagnostics().failures).toBe(0);

    renderGate.resolve(undefined);
    await expect(request.promise).resolves.toBeNull();
    expect(service.getDiagnostics()).toMatchObject({ cacheMisses: 1, failures: 1 });
  });

  it("records one total duration for a multi-stage request", async () => {
    const service = createModelThumbnailService(dependencies());

    await service.request(model(), "visible").promise;

    expect(service.getDiagnostics().durationMs).toMatchObject({
      io: { count: 2 },
      render: { count: 1 },
      total: { count: 1 }
    });
  });

  it("records long-task durations in the shared diagnostics stream", () => {
    const service = createModelThumbnailService(dependencies());

    service.recordLongTask(142);

    expect(service.getDiagnostics().longTasks).toEqual({ count: 1, maximumMs: 142 });
  });

  it("preserves queued stage counts alongside priority aggregates", async () => {
    const renderGate = deferred<void>();
    const service = createModelThumbnailService(dependencies({
      yieldBeforeRender: () => renderGate.promise
    }));
    const first = service.request(model({ absolutePath: "C:\\Models\\first.stl" }), "selected");
    const second = service.request(model({ absolutePath: "C:\\Models\\second.stl" }), "visible");

    await vi.waitFor(() => {
      expect(service.getDiagnostics()).toMatchObject({
        queued: { visible: 1, total: 1 },
        queuedByStage: { io: 0, render: 1, total: 1 },
        running: { render: 1, total: 1 }
      });
    });

    renderGate.resolve(undefined);
    await Promise.all([first.promise, second.promise]);
  });

  it("coalesces requests before reading the disk cache", async () => {
    const cacheRead = vi.fn(async () => WEBP);
    const service = createModelThumbnailService(dependencies({ readCachedThumbnail: cacheRead }));

    const first = service.request(model(), "nearby");
    const second = service.request(model(), "visible");

    await expect(Promise.all([first.promise, second.promise])).resolves.toEqual([WEBP, WEBP]);
    expect(cacheRead).toHaveBeenCalledTimes(1);
  });

  it("uses an embedded 3MF image before generated rendering", async () => {
    const render = vi.fn();
    const service = createModelThumbnailService(dependencies({
      readCachedThumbnail: async () => null,
      readEmbeddedThumbnail: async () => PNG,
      renderThumbnail: render
    }));

    await expect(service.request(model({ extension: ".3mf" }), "visible").promise)
      .resolves.toBe(PNG);
    expect(render).not.toHaveBeenCalled();
  });

  it("reads direct images after a cache miss without entering the render queue", async () => {
    const readImageDataUrl = vi.fn(async () => "data:image/webp;base64,AAAA");
    const renderThumbnail = vi.fn(() => WEBP);
    const service = createModelThumbnailService(dependencies({
      readImageDataUrl,
      renderThumbnail
    }));

    await expect(service.request(model({
      name: "photo.webp",
      extension: ".webp",
      absolutePath: "C:\\Models\\photo.webp"
    }), "visible").promise).resolves.toBe("data:image/webp;base64,AAAA");

    expect(readImageDataUrl).toHaveBeenCalledWith(
      librarySession("unbound", 0, "C:\\"),
      "C:\\Models\\photo.webp"
    );
    expect(renderThumbnail).not.toHaveBeenCalled();
    expect(service.getDiagnostics().running.render).toBe(0);
  });

  it("uses a cached direct image before reading the source file", async () => {
    const readImageDataUrl = vi.fn(async () => "data:image/jpeg;base64,SOURCE");
    const service = createModelThumbnailService(dependencies({
      readCachedThumbnail: async () => "data:image/jpeg;base64,CACHED",
      readImageDataUrl
    }));

    await expect(service.request(model({ extension: ".jpg" }), "visible").promise)
      .resolves.toBe("data:image/jpeg;base64,CACHED");
    expect(readImageDataUrl).not.toHaveBeenCalled();
  });

  it("caches a valid direct image", async () => {
    const writeCachedThumbnail = vi.fn(async () => undefined);
    const target = model({ extension: ".png", absolutePath: "C:\\Models\\photo.png" });
    const service = createModelThumbnailService(dependencies({
      readImageDataUrl: async () => PNG,
      writeCachedThumbnail
    }));
    service.beginLibrarySession(librarySession("library-a", 1));

    await expect(service.request(target, "visible").promise).resolves.toBe(PNG);
    expect(writeCachedThumbnail).toHaveBeenCalledWith(target, PNG, "library-a:1:C:\\Models");
  });

  it("isolates a corrupt direct image and continues later image requests", async () => {
    const readImageDataUrl = vi.fn(async (_session, absolutePath: string) => {
      if (absolutePath.endsWith("bad.jpg")) throw new Error("corrupt image");
      return PNG;
    });
    const service = createModelThumbnailService(dependencies({ readImageDataUrl }));

    await expect(service.request(model({
      extension: ".jpg",
      absolutePath: "C:\\Models\\bad.jpg"
    }), "visible").promise).resolves.toBeNull();
    await expect(service.request(model({
      extension: ".png",
      absolutePath: "C:\\Models\\good.png"
    }), "visible").promise).resolves.toBe(PNG);
    expect(readImageDataUrl).toHaveBeenCalledTimes(2);
  });

  it("passes the active session to image reads and remembers a decode failure", async () => {
    const activeSession = librarySession("library-a", 1);
    const readImageDataUrl = vi.fn(async () => {
      throw new Error("decode failed");
    });
    const writeCachedThumbnail = vi.fn(async () => undefined);
    const service = createModelThumbnailService(dependencies({
      readImageDataUrl,
      writeCachedThumbnail
    }));
    const target = model({ extension: ".png", absolutePath: "C:\\Models\\bad.png" });
    service.beginLibrarySession(activeSession);

    await expect(service.request(target, "visible").promise).resolves.toBeNull();
    await expect(service.request(target, "visible").promise).resolves.toBeNull();

    expect(readImageDataUrl).toHaveBeenCalledOnce();
    expect(readImageDataUrl).toHaveBeenCalledWith(activeSession, target.absolutePath);
    expect(writeCachedThumbnail).not.toHaveBeenCalled();
  });

  it("settles one failed render and continues with the next model", async () => {
    let shouldFail = true;
    const render = vi.fn(() => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("broken mesh");
      }
      return WEBP;
    });
    const service = createModelThumbnailService(dependencies({ renderThumbnail: render }));

    await expect(service.request(model({ absolutePath: "C:\\Models\\bad.stl" }), "visible").promise)
      .resolves.toBeNull();
    await expect(service.request(model({ absolutePath: "C:\\Models\\good.stl" }), "visible").promise)
      .resolves.toBe(WEBP);
  });

  it("bypasses both queues for archive models", async () => {
    const readCachedThumbnail = vi.fn(async () => WEBP);
    const service = createModelThumbnailService(dependencies({ readCachedThumbnail }));

    const request = service.request(model({ extension: ".zip" }), "selected");

    await expect(request.promise).resolves.toBeNull();
    expect(readCachedThumbnail).not.toHaveBeenCalled();
    expect(service.getDiagnostics()).toMatchObject({
      queued: { total: 0 },
      running: { total: 0 }
    });
  });

  it("keeps a generated image visible when cache persistence fails", async () => {
    const writeCachedThumbnail = vi.fn(async () => {
      throw new Error("disk full");
    });
    const service = createModelThumbnailService(dependencies({ writeCachedThumbnail }));

    await expect(service.request(model(), "visible").promise).resolves.toBe(WEBP);
    await expect(service.request(model(), "visible").promise).resolves.toBe(WEBP);
    expect(writeCachedThumbnail).toHaveBeenCalledTimes(2);
  });

  it("shares the pipeline until cache persistence settles", async () => {
    const persistence = deferred<void>();
    const readCachedThumbnail = vi.fn(async () => null);
    const renderThumbnail = vi.fn(() => WEBP);
    const service = createModelThumbnailService(dependencies({
      readCachedThumbnail,
      renderThumbnail,
      writeCachedThumbnail: () => persistence.promise
    }));

    const first = service.request(model(), "visible");
    await vi.waitFor(() => expect(renderThumbnail).toHaveBeenCalledOnce());
    const second = service.request(model(), "selected");
    persistence.resolve(undefined);

    await expect(Promise.all([first.promise, second.promise])).resolves.toEqual([WEBP, WEBP]);
    expect(readCachedThumbnail).toHaveBeenCalledOnce();
    expect(renderThumbnail).toHaveBeenCalledOnce();
  });

  it("retains failures by signature until retry or a signature change", async () => {
    let shouldFail = true;
    const renderThumbnail = vi.fn(() => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("bad model");
      }
      return WEBP;
    });
    const service = createModelThumbnailService(dependencies({ renderThumbnail }));
    const target = model();

    await expect(service.request(target, "visible").promise).resolves.toBeNull();
    await expect(service.request(target, "visible").promise).resolves.toBeNull();
    expect(renderThumbnail).toHaveBeenCalledTimes(1);

    await expect(service.request(model({ modifiedAt: "2026-09-10T13:00:00.000Z" }), "visible").promise)
      .resolves.toBe(WEBP);
    service.retry(target);
    await expect(service.request(target, "visible").promise).resolves.toBe(WEBP);
    expect(renderThumbnail).toHaveBeenCalledTimes(3);
  });

  it("yields before reading model bytes for generated rendering", async () => {
    const events: string[] = [];
    const service = createModelThumbnailService(dependencies({
      yieldBeforeRender: async () => {
        events.push("frame");
      },
      readModelFile: async () => {
        events.push("read");
        return new ArrayBuffer(8);
      },
      renderThumbnail: () => {
        events.push("render");
        return WEBP;
      }
    }));

    await expect(service.request(model(), "visible").promise).resolves.toBe(WEBP);
    expect(events).toEqual(["frame", "read", "render"]);
  });

  it("runs no more than four I/O jobs concurrently", async () => {
    const gates = Array.from({ length: 5 }, () => deferred<string | null>());
    let active = 0;
    let peak = 0;
    let nextGate = 0;
    const readCachedThumbnail = vi.fn(async () => {
      const gate = gates[nextGate++];
      active += 1;
      peak = Math.max(peak, active);
      const result = await gate.promise;
      active -= 1;
      return result;
    });
    const service = createModelThumbnailService(dependencies({ readCachedThumbnail }));
    const requests = Array.from({ length: 5 }, (_, index) =>
      service.request(model({ absolutePath: `C:\\Models\\${index}.stl` }), "visible")
    );

    await vi.waitFor(() => expect(readCachedThumbnail).toHaveBeenCalledTimes(4));
    expect(peak).toBe(4);
    gates.slice(0, 4).forEach((gate) => gate.resolve(WEBP));
    await vi.waitFor(() => expect(readCachedThumbnail).toHaveBeenCalledTimes(5));
    gates[4].resolve(WEBP);
    await Promise.all(requests.map((request) => request.promise));
    expect(peak).toBe(4);
  });

  it("runs geometry rendering one model at a time", async () => {
    const gates = [deferred<void>(), deferred<void>()];
    let active = 0;
    let peak = 0;
    const yieldBeforeRender = vi.fn(async () => {
      const gate = gates[yieldBeforeRender.mock.calls.length - 1];
      active += 1;
      peak = Math.max(peak, active);
      await gate.promise;
      active -= 1;
    });
    const renderThumbnail = vi.fn(() => WEBP);
    const service = createModelThumbnailService(dependencies({
      renderThumbnail,
      yieldBeforeRender
    }));
    const first = service.request(model({ absolutePath: "C:\\Models\\one.stl" }), "visible");
    const second = service.request(model({ absolutePath: "C:\\Models\\two.stl" }), "visible");

    await vi.waitFor(() => expect(yieldBeforeRender).toHaveBeenCalledTimes(1));
    expect(peak).toBe(1);
    gates[0].resolve(undefined);
    await vi.waitFor(() => expect(yieldBeforeRender).toHaveBeenCalledTimes(2));
    gates[1].resolve(undefined);
    await Promise.all([first.promise, second.promise]);
    expect(renderThumbnail).toHaveBeenCalledTimes(2);
    expect(peak).toBe(1);
  });

  it("maps discarded scheduler values to public null", async () => {
    const blockers = Array.from({ length: 4 }, () => deferred<string | null>());
    let started = 0;
    const service = createModelThumbnailService(dependencies({
      readCachedThumbnail: () => blockers[started++].promise
    }));
    const active = blockers.map((_, index) =>
      service.request(model({ absolutePath: `C:\\Models\\active-${index}.stl` }), "selected")
    );
    await vi.waitFor(() => expect(started).toBe(4));

    const historical = Array.from({ length: 33 }, (_, index) =>
      service.request(model({ absolutePath: `C:\\Models\\history-${index}.stl` }), "historical")
    );

    await expect(historical[0].promise).resolves.toBeNull();
    active.forEach((_, index) => blockers[index].resolve(WEBP));
    await Promise.all(active.map((request) => request.promise));
    await service.onIdle();
  });

  it("publishes diagnostics containing aggregates only", async () => {
    const service = createModelThumbnailService(dependencies());
    const target = model({
      absolutePath: "C:\\private\\identifying-model.stl",
      name: "identifying-model.stl"
    });

    await service.request(target, "visible").promise;

    const serialized = JSON.stringify(service.getDiagnostics());
    expect(serialized).toContain("cacheMisses");
    expect(serialized).not.toContain("private");
    expect(serialized).not.toContain("identifying-model");
    expect(serialized).not.toContain(WEBP);
  });
});

function dependencies(
  overrides: Partial<ModelThumbnailServiceDependencies> = {}
): ModelThumbnailServiceDependencies {
  return {
    readCachedThumbnail: async () => null,
    readEmbeddedThumbnail: async () => null,
    readImageDataUrl: async () => PNG,
    readModelFile: async () => new ArrayBuffer(8),
    writeCachedThumbnail: async () => undefined,
    renderThumbnail: () => WEBP,
    yieldBeforeRender: async () => undefined,
    ...overrides
  };
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function librarySession(libraryId: string, generation: number, rootPath = "C:\\Models") {
  return { libraryId, generation, rootPath };
}
