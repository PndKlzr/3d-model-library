import { afterEach, describe, expect, it, vi } from "vitest";
import { createThumbnailWorkerClient } from "../../src/lib/thumbnailWorkerClient";

afterEach(() => {
  vi.useRealTimers();
});

describe("thumbnailWorkerClient", () => {
  it("reuses a ready Worker and returns a WebP without detaching source bytes", async () => {
    const worker = new FakeWorker();
    const client = createThumbnailWorkerClient(() => worker);
    const source = new ArrayBuffer(4);
    const first = client.render(".stl", source);
    worker.emit({ type: "ready", supported: true });
    await vi.waitFor(() => expect(worker.sent).toHaveLength(1));
    const firstRequest = worker.sent[0] as { id: number; bytes: ArrayBuffer };
    expect(firstRequest.bytes).toBe(source);
    expect(source.byteLength).toBe(4);
    worker.emit({
      type: "result",
      id: firstRequest.id,
      mime: "image/webp",
      bytes: bytes("RIFF0000WEBP")
    });
    await expect(first).resolves.toBe("data:image/webp;base64,UklGRjAwMDBXRUJQ");

    const second = client.render(".3mf", new ArrayBuffer(8));
    await vi.waitFor(() => expect(worker.sent).toHaveLength(2));
    worker.emit({
      type: "result",
      id: (worker.sent[1] as { id: number }).id,
      mime: "image/webp",
      bytes: bytes("RIFF0000WEBP")
    });
    await expect(second).resolves.toContain("data:image/webp;base64,");
    expect(worker.terminated).toBe(0);
  });

  it("returns null when startup or transport fails so the current renderer can run", async () => {
    const unsupported = new FakeWorker();
    const unsupportedClient = createThumbnailWorkerClient(() => unsupported);
    const request = unsupportedClient.render(".stl", new ArrayBuffer(4));
    unsupported.emit({ type: "ready", supported: false });
    await expect(request).resolves.toBeNull();
    expect(unsupported.sent).toHaveLength(0);

    const crashed = new FakeWorker();
    const crashedClient = createThumbnailWorkerClient(() => crashed);
    const pending = crashedClient.render(".stl", new ArrayBuffer(4));
    crashed.emit({ type: "ready", supported: true });
    await vi.waitFor(() => expect(crashed.sent).toHaveLength(1));
    crashed.crash();
    await expect(pending).resolves.toBeNull();
    await expect(crashedClient.render(".stl", new ArrayBuffer(4))).resolves.toBeNull();
    expect(crashed.terminated).toBe(1);
  });

  it("rejects model errors without falling back to the UI renderer", async () => {
    const worker = new FakeWorker();
    const client = createThumbnailWorkerClient(() => worker);
    const pending = client.render(".obj", new ArrayBuffer(4));
    worker.emit({ type: "ready", supported: true });
    await vi.waitFor(() => expect(worker.sent).toHaveLength(1));
    worker.emit({ type: "error", id: (worker.sent[0] as { id: number }).id, message: "bad OBJ" });
    await expect(pending).rejects.toThrow("bad OBJ");
    expect(worker.terminated).toBe(0);
  });

  it("terminates a stuck job and starts a fresh Worker for the next model", async () => {
    vi.useFakeTimers();
    const firstWorker = new FakeWorker();
    const nextWorker = new FakeWorker();
    const factory = vi.fn()
      .mockReturnValueOnce(firstWorker)
      .mockReturnValueOnce(nextWorker);
    const client = createThumbnailWorkerClient(factory);
    const stuck = client.render(".3mf", new ArrayBuffer(4));
    const stuckAssertion = expect(stuck).rejects.toThrow("timed out");
    firstWorker.emit({ type: "ready", supported: true });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15_000);
    await stuckAssertion;
    expect(firstWorker.terminated).toBe(1);

    const next = client.render(".stl", new ArrayBuffer(4));
    nextWorker.emit({ type: "ready", supported: true });
    await Promise.resolve();
    nextWorker.emit({
      type: "result",
      id: (nextWorker.sent[0] as { id: number }).id,
      mime: "image/webp",
      bytes: bytes("RIFF0000WEBP")
    });
    await expect(next).resolves.toContain("data:image/webp;base64,");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("cancels an old-library job without disabling the next library", async () => {
    const oldWorker = new FakeWorker();
    const newWorker = new FakeWorker();
    const client = createThumbnailWorkerClient(vi.fn()
      .mockReturnValueOnce(oldWorker)
      .mockReturnValueOnce(newWorker));
    const old = client.render(".stl", new ArrayBuffer(4));
    oldWorker.emit({ type: "ready", supported: true });
    await vi.waitFor(() => expect(oldWorker.sent).toHaveLength(1));

    client.cancel();

    await expect(old).resolves.toBeNull();
    expect(oldWorker.terminated).toBe(1);
    const next = client.render(".3mf", new ArrayBuffer(4));
    newWorker.emit({ type: "ready", supported: true });
    await vi.waitFor(() => expect(newWorker.sent).toHaveLength(1));
    newWorker.emit({
      type: "result",
      id: (newWorker.sent[0] as { id: number }).id,
      mime: "image/webp",
      bytes: bytes("RIFF0000WEBP")
    });
    await expect(next).resolves.toContain("data:image/webp;base64,");
  });

  it("falls back when the Worker reports a lost GPU context", async () => {
    const worker = new FakeWorker();
    const client = createThumbnailWorkerClient(() => worker);
    const pending = client.render(".stl", new ArrayBuffer(4));
    worker.emit({ type: "ready", supported: true });
    await vi.waitFor(() => expect(worker.sent).toHaveLength(1));
    worker.emit({ type: "unavailable", id: (worker.sent[0] as { id: number }).id });

    await expect(pending).resolves.toBeNull();
    expect(worker.terminated).toBe(1);
  });

  it("falls back if the Worker never finishes startup", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const client = createThumbnailWorkerClient(() => worker);
    const pending = client.render(".stl", new ArrayBuffer(4));
    const assertion = expect(pending).resolves.toBeNull();

    await vi.advanceTimersByTimeAsync(5_000);

    await assertion;
    expect(worker.terminated).toBe(1);
    await expect(client.render(".stl", new ArrayBuffer(4))).resolves.toBeNull();
  });
});

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: unknown[] = [];
  terminated = 0;

  postMessage(message: unknown) {
    this.sent.push(message);
  }

  terminate() {
    this.terminated += 1;
  }

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }

  crash() {
    this.onerror?.({ message: "transport failed" } as ErrorEvent);
  }
}

function bytes(content: string): ArrayBuffer {
  return Uint8Array.from(content, (character) => character.charCodeAt(0)).buffer;
}
