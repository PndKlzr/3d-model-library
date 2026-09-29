import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { LibrarySessionRef } from "../../src/shared/types";
import { OBJ_PREVIEW_BUDGET, OBJ_PREVIEW_LIMIT_ERROR } from "../../src/shared/objPreviewBudget";
import { readLibraryObjPreview } from "../../electron/services/libraryObj";

describe("library OBJ preview access", () => {
  it("rejects the descriptor's real oversized size before allocating or reading", async () => {
    const fixture = createFixture({ beforeSize: OBJ_PREVIEW_BUDGET.maxSourceBytes + 1 });

    await expect(readLibraryObjPreview(fixture.session, fixture.filePath, fixture.access))
      .rejects.toThrow(OBJ_PREVIEW_LIMIT_ERROR);
    expect(fixture.handle.read).not.toHaveBeenCalled();
    expect(fixture.handle.close).toHaveBeenCalledOnce();
  });

  it("rejects a file that grows while reading and closes its only descriptor", async () => {
    const fixture = createFixture({
      bytes: objBytes(),
      afterSize: objBytes().length + 1
    });

    await expect(readLibraryObjPreview(fixture.session, fixture.filePath, fixture.access))
      .rejects.toThrow(/alterado durante a leitura/i);
    expect(fixture.access.fileSystem.open).toHaveBeenCalledOnce();
    expect(fixture.handle.close).toHaveBeenCalledOnce();
  });

  it("rejects replacement of the path while preserving descriptor ownership", async () => {
    const fixture = createFixture({ bytes: objBytes(), pathIno: 99 });

    await expect(readLibraryObjPreview(fixture.session, fixture.filePath, fixture.access))
      .rejects.toThrow(/substituído durante a leitura.*ino/i);
    expect(fixture.access.fileSystem.open).toHaveBeenCalledOnce();
    expect(fixture.handle.close).toHaveBeenCalledOnce();
  });

  it("accepts the same file when Windows reports a different path ctime after close", async () => {
    const bytes = objBytes();
    const fixture = createFixture({ bytes, pathCtimeMs: 91 });

    const result = await readLibraryObjPreview(fixture.session, fixture.filePath, fixture.access);

    expect(Buffer.from(result)).toEqual(bytes);
    expect(fixture.handle.close).toHaveBeenCalledOnce();
  });

  it("accepts the same file when Windows reports a different path device after close", async () => {
    const bytes = objBytes();
    const fixture = createFixture({ bytes, pathDev: 19, platform: "win32" });

    const result = await readLibraryObjPreview(fixture.session, fixture.filePath, fixture.access);

    expect(Buffer.from(result)).toEqual(bytes);
    expect(fixture.handle.close).toHaveBeenCalledOnce();
  });

  it("still rejects a different path device outside Windows", async () => {
    const fixture = createFixture({ bytes: objBytes(), pathDev: 19, platform: "linux" });

    await expect(readLibraryObjPreview(fixture.session, fixture.filePath, fixture.access))
      .rejects.toThrow(/substituído durante a leitura.*dev/i);
  });

  it("rejects a stale session after reading and still closes the descriptor", async () => {
    const fixture = createFixture({
      bytes: objBytes(),
      onRead: () => {
        fixture.current.value = session("C:\\Other", "library-b", 2);
      }
    });

    await expect(readLibraryObjPreview(fixture.session, fixture.filePath, fixture.access))
      .rejects.toThrow(/sessão.*alterada/i);
    expect(fixture.handle.close).toHaveBeenCalledOnce();
  });

  it("rechecks the session after fstat before allocating or reading", async () => {
    const fixture = createFixture({
      bytes: objBytes(),
      onFirstStat: () => {
        fixture.current.value = session("C:\\Other", "library-b", 2);
      }
    });

    await expect(readLibraryObjPreview(fixture.session, fixture.filePath, fixture.access))
      .rejects.toThrow(/sessão.*alterada/i);
    expect(fixture.handle.read).not.toHaveBeenCalled();
    expect(fixture.handle.close).toHaveBeenCalledOnce();
  });

  it("does not open the path after the active session changes during canonicalization", async () => {
    const fixture = createFixture({
      bytes: objBytes(),
      onFileRealpath: () => {
        fixture.current.value = session("C:\\Other", "library-b", 2);
      }
    });

    await expect(readLibraryObjPreview(fixture.session, fixture.filePath, fixture.access))
      .rejects.toThrow(/sessão.*alterada/i);
    expect(fixture.access.fileSystem.open).not.toHaveBeenCalled();
  });

  it("returns exact bytes for a stable OBJ inside the active library", async () => {
    const bytes = objBytes();
    const fixture = createFixture({ bytes });

    const result = await readLibraryObjPreview(fixture.session, fixture.filePath, fixture.access);

    expect(Buffer.from(result)).toEqual(bytes);
    expect(fixture.handle.close).toHaveBeenCalledOnce();
  });
});

function createFixture(options: {
  bytes?: Buffer;
  beforeSize?: number;
  afterSize?: number;
  pathIno?: number;
  pathDev?: number;
  pathCtimeMs?: number;
  platform?: NodeJS.Platform;
  onRead?: () => void;
  onFirstStat?: () => void;
  onFileRealpath?: () => void;
} = {}) {
  const root = path.resolve("C:\\Models");
  const filePath = path.join(root, "shape.obj");
  const bytes = options.bytes ?? Buffer.alloc(0);
  const sessionRef = session(root);
  const current = { value: sessionRef };
  let statCalls = 0;
  const baseStat = {
    isFile: () => true,
    size: options.beforeSize ?? bytes.length,
    dev: 7,
    ino: 11,
    mtimeMs: 100,
    ctimeMs: 90
  };
  const handle = {
    stat: vi.fn(async () => {
      const first = statCalls++ === 0;
      if (first) options.onFirstStat?.();
      return {
        ...baseStat,
        size: first ? baseStat.size : options.afterSize ?? baseStat.size
      };
    }),
    read: vi.fn(async (target: Uint8Array, offset: number, length: number) => {
      options.onRead?.();
      const bytesRead = Math.min(length, bytes.length - offset);
      if (bytesRead > 0) target.set(bytes.subarray(offset, offset + bytesRead), offset);
      return { bytesRead };
    }),
    close: vi.fn(async () => undefined)
  };
  const fileSystem = {
    realpath: vi.fn(async (value: string) => {
      if (value === root) return root;
      options.onFileRealpath?.();
      return filePath;
    }),
    open: vi.fn(async () => handle),
    stat: vi.fn(async () => ({
      ...baseStat,
      dev: options.pathDev ?? baseStat.dev,
      ino: options.pathIno ?? baseStat.ino,
      ctimeMs: options.pathCtimeMs ?? baseStat.ctimeMs,
      size: options.afterSize ?? baseStat.size
    }))
  };

  return {
    session: sessionRef,
    current,
    filePath,
    handle,
    access: { getCurrentSession: () => current.value, fileSystem, platform: options.platform }
  };
}

function session(rootPath: string, libraryId = "library-a", generation = 1): LibrarySessionRef {
  return { rootPath, libraryId, generation };
}

function objBytes() {
  return Buffer.from("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3");
}
