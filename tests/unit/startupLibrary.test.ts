import { describe, expect, it, vi } from "vitest";
import { activateStartupLibrary } from "../../electron/services/startupLibrary";

describe("startupLibrary", () => {
  it("keeps startup alive when the saved library is unavailable", async () => {
    const unavailable = new Error("Drive is disconnected");
    const activate = vi.fn().mockRejectedValue(unavailable);
    const onUnavailable = vi.fn();

    const result = await activateStartupLibrary({ activate }, "F:\\Stls", true, onUnavailable);

    expect(result).toBeNull();
    expect(activate).toHaveBeenCalledWith("F:\\Stls", true);
    expect(onUnavailable).toHaveBeenCalledWith(unavailable);
  });
});
