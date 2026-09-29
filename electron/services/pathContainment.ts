import path from "node:path";

export function isPathInside(rootPath: string, candidatePath: string): boolean {
  return isContained(rootPath, candidatePath, false);
}

export function isPathAtOrInside(rootPath: string, candidatePath: string): boolean {
  return isContained(rootPath, candidatePath, true);
}

function isContained(rootPath: string, candidatePath: string, allowRoot: boolean): boolean {
  if (!path.isAbsolute(candidatePath)) return false;
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  if (relativePath === "") return allowRoot;
  return relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath);
}
