import { describe, expect, it } from "vitest";
import { toggleResponsivePanel } from "../../src/lib/responsivePanels";

describe("responsive panel state", () => {
  it("opens and closes the requested panel", () => {
    expect(toggleResponsivePanel(null, "folders")).toBe("folders");
    expect(toggleResponsivePanel("folders", "folders")).toBeNull();
  });

  it("replaces the open panel when another one is requested", () => {
    expect(toggleResponsivePanel("folders", "details")).toBe("details");
    expect(toggleResponsivePanel("details", "folders")).toBe("folders");
  });
});
