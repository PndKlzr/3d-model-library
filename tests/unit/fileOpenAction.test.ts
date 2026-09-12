import { describe, expect, it } from "vitest";
import { getDefaultFileOpenAction } from "../../src/lib/fileOpenAction";

describe("getDefaultFileOpenAction", () => {
  it("routes every supported category without leaking slicer behavior", () => {
    expect(getDefaultFileOpenAction(".stl")).toBe("slicer");
    expect(getDefaultFileOpenAction(".3mf")).toBe("slicer");
    expect(getDefaultFileOpenAction(".obj")).toBe("preview");
    expect(getDefaultFileOpenAction(".png")).toBe("windows");
    expect(getDefaultFileOpenAction(".jpeg")).toBe("windows");
    expect(getDefaultFileOpenAction(".zip")).toBe("inspect-archive");
    expect(getDefaultFileOpenAction(".rar")).toBe("inspect-archive");
    expect(getDefaultFileOpenAction(".7z")).toBe("inspect-archive");
  });
});
