import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const rendererFiles = [
  "src/App.tsx",
  "src/components/AppErrorBoundary.tsx",
  "src/components/ConfirmDialog.tsx",
  "src/components/DetailsPanel.tsx",
  "src/components/DialogHeader.tsx",
  "src/components/DialogShell.tsx",
  "src/components/FileTypeFilter.tsx",
  "src/components/FirstRun.tsx",
  "src/components/FolderCardThumbnail.tsx",
  "src/components/FolderTree.tsx",
  "src/components/ModelCardThumbnail.tsx",
  "src/components/ModelGrid.tsx",
  "src/components/ModelViewer.tsx",
  "src/components/PerformanceDiagnostics.tsx",
  "src/components/ResponsivePanelControls.tsx",
  "src/components/SettingsDialog.tsx",
  "src/components/TagSelector.tsx",
  "src/components/TextInputDialog.tsx",
  "src/components/ThumbnailQueueStatus.tsx"
];

const visibleAttributeNames = new Set([
  "aria-label",
  "confirmLabel",
  "description",
  "eyebrow",
  "label",
  "placeholder",
  "title"
]);

const allowedVisibleLiterals = new Set([
  "3D",
  "3MF",
  "7-Zip",
  "Cura",
  "Creality Print",
  "English",
  "Model Library",
  "OBJ",
  "Português (Brasil)",
  "RAR",
  "STL",
  "ZIP"
]);

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isVisibleText(value: string) {
  const normalized = normalizeText(value);
  return /[A-Za-zÀ-ÿ]/.test(normalized) && !allowedVisibleLiterals.has(normalized);
}

function collectVisibleLiterals(relativePath: string) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    absolutePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const findings: string[] = [];

  function add(node: ts.Node, value: string) {
    const normalized = normalizeText(value);
    if (!isVisibleText(normalized)) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push(`${relativePath}:${line + 1}: ${normalized}`);
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) add(node, node.getText(sourceFile));

    if (ts.isJsxAttribute(node) && visibleAttributeNames.has(node.name.getText(sourceFile))) {
      const initializer = node.initializer;
      if (initializer && ts.isStringLiteral(initializer)) add(initializer, initializer.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

describe("localized renderer contract", () => {
  it("keeps visible renderer copy in the translation catalogs", () => {
    const findings = rendererFiles.flatMap(collectVisibleLiterals);
    expect(findings, findings.join("\n")).toEqual([]);
  });
});
