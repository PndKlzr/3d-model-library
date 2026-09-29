export type ObjPreviewBudget = {
  maxSourceBytes: number;
  maxLines: number;
  maxVertices: number;
  maxFaces: number;
  maxFaceReferences: number;
};

// OBJ parsing runs on the renderer thread. These bounds cap both source allocation
// and the text complexity handed to OBJLoader while retaining normal print models.
export const OBJ_PREVIEW_BUDGET: Readonly<ObjPreviewBudget> = Object.freeze({
  maxSourceBytes: 64 * 1024 * 1024,
  maxLines: 1_000_000,
  maxVertices: 500_000,
  maxFaces: 500_000,
  maxFaceReferences: 1_500_000
});

export const OBJ_PREVIEW_LIMIT_ERROR = "OBJ excede o limite seguro de visualização.";

export function isObjSourceSizeWithinBudget(byteLength: number) {
  return Number.isSafeInteger(byteLength) &&
    byteLength >= 0 &&
    byteLength <= OBJ_PREVIEW_BUDGET.maxSourceBytes;
}

export function assertObjSourceSizeWithinBudget(byteLength: number) {
  if (!isObjSourceSizeWithinBudget(byteLength)) throw new Error(OBJ_PREVIEW_LIMIT_ERROR);
}

export function assertObjTextWithinBudget(source: string) {
  let lineCount = 0;
  let vertexCount = 0;
  let faceCount = 0;
  let faceReferenceCount = 0;
  let lineStart = 0;

  while (lineStart < source.length || (source.length === 0 && lineStart === 0)) {
    lineCount += 1;
    assertCount(lineCount, OBJ_PREVIEW_BUDGET.maxLines);

    const newline = source.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? source.length : newline;
    let cursor = skipWhitespace(source, lineStart, lineEnd);
    const commandStart = cursor;
    while (cursor < lineEnd && !isWhitespace(source.charCodeAt(cursor))) cursor += 1;
    const command = source.slice(commandStart, cursor);

    if (command === "v") {
      vertexCount += 1;
      assertCount(vertexCount, OBJ_PREVIEW_BUDGET.maxVertices);
    } else if (command === "f") {
      faceCount += 1;
      assertCount(faceCount, OBJ_PREVIEW_BUDGET.maxFaces);
      faceReferenceCount += countFaceReferences(source, cursor, lineEnd);
      assertCount(faceReferenceCount, OBJ_PREVIEW_BUDGET.maxFaceReferences);
    }

    if (newline === -1) break;
    lineStart = newline + 1;
  }
}

function countFaceReferences(source: string, start: number, end: number) {
  let count = 0;
  let cursor = start;
  while (cursor < end) {
    cursor = skipWhitespace(source, cursor, end);
    if (cursor >= end || source.charCodeAt(cursor) === 35) break;
    count += 1;
    while (cursor < end && !isWhitespace(source.charCodeAt(cursor))) cursor += 1;
  }
  return count;
}

function skipWhitespace(source: string, start: number, end: number) {
  let cursor = start;
  while (cursor < end && isWhitespace(source.charCodeAt(cursor))) cursor += 1;
  return cursor;
}

function isWhitespace(code: number) {
  return code === 32 || code === 9 || code === 13;
}

function assertCount(value: number, maximum: number) {
  if (value > maximum) throw new Error(OBJ_PREVIEW_LIMIT_ERROR);
}
