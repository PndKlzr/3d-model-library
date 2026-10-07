import { describe, expect, it } from "vitest";
import { shouldStartNormalApplication } from "../../electron/services/squirrelStartup";

describe("Squirrel startup lifecycle", () => {
  it("skips normal application startup while Squirrel handles an event", () => {
    expect(shouldStartNormalApplication(true)).toBe(false);
  });

  it("starts the application when no Squirrel event is active", () => {
    expect(shouldStartNormalApplication(false)).toBe(true);
  });
});
