import { describe, expect, it, vi } from "vitest";
import { startNativeFileDropDrag } from "../../electron/services/nativeFileDragHelper";

describe("nativeFileDragHelper", () => {
  it("does not start the helper without a helper path or files", () => {
    const spawnProcess = vi.fn();

    expect(startNativeFileDropDrag(null, ["C:\\library\\part.stl"], spawnProcess)).toBe(false);
    expect(startNativeFileDropDrag("C:\\helper.exe", [], spawnProcess)).toBe(false);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("spawns the Windows helper with file paths as process arguments", () => {
    const previousPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    const unref = vi.fn();
    const spawnProcess = vi.fn(() => ({ unref }));

    try {
      expect(
        startNativeFileDropDrag(
          "C:\\helper.exe",
          ["C:\\library\\part.stl", "C:\\library\\part.3mf"],
          spawnProcess
        )
      ).toBe(true);
    } finally {
      Object.defineProperty(process, "platform", { value: previousPlatform });
    }

    expect(spawnProcess).toHaveBeenCalledWith(
      "C:\\helper.exe",
      ["C:\\library\\part.stl", "C:\\library\\part.3mf"],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      }
    );
    expect(unref).toHaveBeenCalled();
  });
});
