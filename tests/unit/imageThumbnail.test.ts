import { afterEach, describe, expect, it, vi } from "vitest";
import { compactImageThumbnail } from "../../src/lib/imageThumbnail";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("imageThumbnail", () => {
  it("fits a photo into a small WebP without cropping it", async () => {
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    vi.stubGlobal("Image", class {
      src = "";
      naturalWidth = 1000;
      naturalHeight = 500;
      decode = async () => undefined;
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "",
      fillRect,
      drawImage
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/webp;base64,COMPACT");

    await expect(compactImageThumbnail("data:image/jpeg;base64,SOURCE"))
      .resolves.toBe("data:image/webp;base64,COMPACT");
    expect(fillRect).toHaveBeenCalledWith(0, 0, 260, 180);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 25, 260, 130);
  });

  it("keeps the source when browser decoding fails", async () => {
    vi.stubGlobal("Image", class {
      src = "";
      decode = async () => { throw new Error("decode failed"); };
    });

    await expect(compactImageThumbnail("data:image/png;base64,SOURCE"))
      .resolves.toBe("data:image/png;base64,SOURCE");
  });
});
