import { describe, expect, it } from "vitest";
import {
  assertObjTextWithinBudget,
  OBJ_PREVIEW_BUDGET,
  OBJ_PREVIEW_LIMIT_ERROR
} from "../../src/shared/objPreviewBudget";

describe("OBJ preview complexity budget", () => {
  it("keeps stable conservative limits", () => {
    expect(OBJ_PREVIEW_BUDGET).toEqual({
      maxSourceBytes: 64 * 1024 * 1024,
      maxLines: 1_000_000,
      maxVertices: 500_000,
      maxFaces: 500_000,
      maxFaceReferences: 1_500_000
    });
  });

  it.each([
    ["vertices", "v 0 0 0\n".repeat(OBJ_PREVIEW_BUDGET.maxVertices + 1)],
    ["faces", "f 1 2 3\n".repeat(OBJ_PREVIEW_BUDGET.maxFaces + 1)],
    ["face references", `f ${"1 ".repeat(OBJ_PREVIEW_BUDGET.maxFaceReferences + 1)}`]
  ])("rejects excessive %s during preflight", (_label, source) => {
    expect(() => assertObjTextWithinBudget(source)).toThrow(OBJ_PREVIEW_LIMIT_ERROR);
  });

  it("accepts the exact line-count boundary", () => {
    const source = `${"#\n".repeat(OBJ_PREVIEW_BUDGET.maxLines - 1)}#`;

    expect(() => assertObjTextWithinBudget(source)).not.toThrow();
  });
});
