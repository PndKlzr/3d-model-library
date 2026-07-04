# 3D Model Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows desktop app that scans a saved STL/3MF library folder, displays models visually, previews selected files in 3D, and opens them in configured slicers.

**Architecture:** Use Electron for desktop filesystem and process access, React for the app shell, and Three.js for model preview. Keep the main process responsible for local IO, settings, scanning, parsing metadata, and launching slicers; keep the renderer responsible for filtering, layout, and user interaction through a typed preload API.

**Tech Stack:** Electron, Vite, React, TypeScript, Three.js, @react-three/fiber, Vitest, Testing Library, electron-store, fast-xml-parser, fflate.

---

## File Structure

- `package.json`: npm scripts, runtime dependencies, dev dependencies.
- `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`: TypeScript and Vite configuration.
- `index.html`: Vite renderer entry point.
- `electron/main.ts`: Electron lifecycle, IPC handlers, settings, folder picker, slicer launch.
- `electron/preload.ts`: typed bridge exposed to the renderer.
- `electron/services/settingsStore.ts`: local app settings persistence.
- `electron/services/libraryScanner.ts`: recursive STL/3MF discovery and filesystem metadata.
- `electron/services/modelMetadata.ts`: STL/3MF metadata parsing for dimensions and object counts.
- `electron/services/slicerLauncher.ts`: external slicer executable validation and process spawning.
- `src/shared/types.ts`: shared TypeScript contracts between main, preload, and renderer.
- `src/main.tsx`: React entry point.
- `src/App.tsx`: app shell and state orchestration.
- `src/components/FirstRun.tsx`: first-launch folder picker screen.
- `src/components/FolderTree.tsx`: folder navigation.
- `src/components/ModelGrid.tsx`: model cards and search results.
- `src/components/DetailsPanel.tsx`: selected model details, preview, slicer actions.
- `src/components/ModelViewer.tsx`: Three.js preview.
- `src/components/SettingsDialog.tsx`: library folder, include-subfolders, slicer paths.
- `src/lib/folderFilters.ts`: pure folder/search filtering helpers.
- `src/styles.css`: application styling.
- `tests/unit/*.test.ts`: pure unit tests for settings defaults, filtering, scanner behavior, metadata parsing, and slicer validation.

---

### Task 1: Scaffold Electron React App

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`

- [ ] **Step 1: Create npm project files**

Create `package.json` with scripts and dependencies:

```json
{
  "name": "model-library",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "electron:dev": "concurrently \"vite --host 127.0.0.1\" \"wait-on http://127.0.0.1:5173 && electron .\"",
    "build": "tsc -p tsconfig.node.json && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@react-three/drei": "^9.122.0",
    "@react-three/fiber": "^8.17.10",
    "electron-store": "^10.0.0",
    "fast-xml-parser": "^4.5.1",
    "fflate": "^0.8.2",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "^0.171.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.17",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "concurrently": "^9.1.0",
    "electron": "^33.2.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "vitest": "^2.1.8",
    "wait-on": "^8.0.1"
  }
}
```

- [ ] **Step 2: Create TypeScript and Vite config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist-electron",
    "rootDir": ".",
    "types": ["node", "electron"]
  },
  "include": ["electron", "src/shared"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  build: {
    outDir: "dist-renderer"
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: []
  }
});
```

- [ ] **Step 3: Create initial app shell**

Create `index.html`, `src/main.tsx`, `src/App.tsx`, and `src/styles.css` with a visible desktop layout placeholder. `App.tsx` should render a left sidebar, central grid area, and right details area so the layout can be validated before data is wired.

- [ ] **Step 4: Create minimal Electron entry points**

Create `electron/main.ts` with Electron window creation, loading `http://127.0.0.1:5173` in dev and `dist-renderer/index.html` in production.

Create `electron/preload.ts` with a placeholder `window.modelLibrary` bridge object.

- [ ] **Step 5: Install dependencies and verify scaffold**

Run:

```powershell
npm install
npm run build
```

Expected: dependency install completes, TypeScript passes, and Vite creates `dist-renderer`.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html src electron
git commit -m "feat: scaffold electron react app"
```

---

### Task 2: Shared Types And Settings Store

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/preload.d.ts`
- Create: `electron/services/settingsStore.ts`
- Modify: `electron/preload.ts`
- Modify: `src/App.tsx`
- Test: `tests/unit/settingsStore.test.ts`

- [ ] **Step 1: Add shared contracts**

Create `src/shared/types.ts` defining:

```ts
export type SlicerConfig = {
  id: string;
  name: string;
  executablePath: string;
  enabled: boolean;
};

export type AppSettings = {
  libraryPath: string | null;
  includeSubfolders: boolean;
  slicers: SlicerConfig[];
};

export type ModelFile = {
  id: string;
  name: string;
  extension: ".stl" | ".3mf";
  absolutePath: string;
  relativeFolder: string;
  sizeBytes: number;
  modifiedAt: string;
  dimensionsMm: { x: number; y: number; z: number } | null;
  objectCount: number | null;
  previewError: string | null;
};

export type LibraryScanResult = {
  rootPath: string;
  models: ModelFile[];
  errors: Array<{ path: string; message: string }>;
};

export type SlicerLaunchResult = {
  ok: boolean;
  message: string;
};
```

- [ ] **Step 2: Write settings tests**

Create `tests/unit/settingsStore.test.ts` with tests for default settings, saving a library path, saving include-subfolders state, and updating slicer paths.

- [ ] **Step 3: Implement settings store**

Create `electron/services/settingsStore.ts` using `electron-store`. Defaults must include `libraryPath: null`, `includeSubfolders: true`, and disabled Cura/Creality Print entries with empty executable paths.

- [ ] **Step 4: Expose settings through preload**

Update `electron/preload.ts` and create `src/shared/preload.d.ts` so renderer code can call:

```ts
window.modelLibrary.getSettings();
window.modelLibrary.saveSettings(settings);
window.modelLibrary.chooseLibraryFolder();
```

- [ ] **Step 5: Wire first settings load**

Update `src/App.tsx` to load settings on mount and choose between the first-run screen placeholder and main layout based on `settings.libraryPath`.

- [ ] **Step 6: Run tests**

```powershell
npm test -- tests/unit/settingsStore.test.ts
npm run build
```

Expected: tests pass and build succeeds.

- [ ] **Step 7: Commit**

```powershell
git add src/shared electron/services/settingsStore.ts electron/preload.ts src/App.tsx tests/unit/settingsStore.test.ts
git commit -m "feat: add persisted app settings"
```

---

### Task 3: Library Scanner And Folder Filtering

**Files:**
- Create: `electron/services/libraryScanner.ts`
- Create: `src/lib/folderFilters.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/shared/preload.d.ts`
- Test: `tests/unit/libraryScanner.test.ts`
- Test: `tests/unit/folderFilters.test.ts`

- [ ] **Step 1: Write scanner tests**

Create temporary folders in the test with STL, 3MF, TXT, and nested STL files. Verify only `.stl` and `.3mf` are returned, extensions are lowercase typed values, relative folders are correct, and inaccessible files become scan errors when reproducible on the current OS.

- [ ] **Step 2: Implement scanner**

Create `electron/services/libraryScanner.ts` with:

```ts
export async function scanLibrary(rootPath: string): Promise<LibraryScanResult>
```

Use `fs.promises.readdir({ withFileTypes: true })` recursively. For each model file, use `stat` to populate name, extension, absolute path, relative folder, size bytes, modified ISO date, and initial metadata fields as `null`.

- [ ] **Step 3: Write folder filter tests**

Create `tests/unit/folderFilters.test.ts` covering:

- All view returns every model.
- Folder with include-subfolders on returns nested files.
- Folder with include-subfolders off returns only direct files.
- Search matches file names.
- Search matches relative folder paths.

- [ ] **Step 4: Implement folder filters**

Create `src/lib/folderFilters.ts` with:

```ts
export function filterModels(
  models: ModelFile[],
  selectedFolder: string,
  includeSubfolders: boolean,
  searchQuery: string
): ModelFile[]
```

Use `"__all__"` as the All view folder id. Normalize Windows separators to `/` for comparison.

- [ ] **Step 5: Add IPC scan handler**

Update `electron/main.ts` with an IPC handler named `library:scan` that calls `scanLibrary`.

Update `electron/preload.ts` and `src/shared/preload.d.ts` to expose:

```ts
window.modelLibrary.scanLibrary(rootPath);
```

- [ ] **Step 6: Run tests**

```powershell
npm test -- tests/unit/libraryScanner.test.ts tests/unit/folderFilters.test.ts
npm run build
```

Expected: tests pass and build succeeds.

- [ ] **Step 7: Commit**

```powershell
git add electron/services/libraryScanner.ts src/lib/folderFilters.ts electron/main.ts electron/preload.ts src/shared/preload.d.ts tests/unit/libraryScanner.test.ts tests/unit/folderFilters.test.ts
git commit -m "feat: scan and filter model library"
```

---

### Task 4: STL And 3MF Metadata Parsing

**Files:**
- Create: `electron/services/modelMetadata.ts`
- Modify: `electron/services/libraryScanner.ts`
- Test: `tests/unit/modelMetadata.test.ts`

- [ ] **Step 1: Write metadata tests**

Create tests for:

- ASCII STL triangle vertices produce correct bounding box dimensions.
- Binary STL triangle vertices produce correct bounding box dimensions.
- Empty or corrupt STL returns a readable preview error.
- Minimal 3MF zip with `3D/3dmodel.model` reports object count from XML.

- [ ] **Step 2: Implement STL parser**

In `modelMetadata.ts`, implement:

```ts
export async function readModelMetadata(filePath: string): Promise<{
  dimensionsMm: ModelFile["dimensionsMm"];
  objectCount: number | null;
  previewError: string | null;
}>
```

Detect binary STL using the 80-byte header plus triangle count and expected byte length. Parse vertices from binary STL triangles. For ASCII STL, parse `vertex x y z` lines. Compute bounding-box dimensions from min/max coordinates.

- [ ] **Step 3: Implement 3MF metadata reader**

Use `fflate` to unzip `.3mf`, `fast-xml-parser` to parse `3D/3dmodel.model`, count `<object>` entries, and calculate approximate dimensions from mesh vertices when present.

- [ ] **Step 4: Enrich scanner output**

Update `libraryScanner.ts` so each discovered file calls `readModelMetadata`. If parsing fails, keep the file in the list with `previewError` set.

- [ ] **Step 5: Run tests**

```powershell
npm test -- tests/unit/modelMetadata.test.ts tests/unit/libraryScanner.test.ts
npm run build
```

Expected: metadata tests pass, scanner tests still pass, and build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add electron/services/modelMetadata.ts electron/services/libraryScanner.ts tests/unit/modelMetadata.test.ts tests/unit/libraryScanner.test.ts
git commit -m "feat: parse model metadata"
```

---

### Task 5: Main UI Data Flow

**Files:**
- Create: `src/components/FirstRun.tsx`
- Create: `src/components/FolderTree.tsx`
- Create: `src/components/ModelGrid.tsx`
- Create: `src/components/DetailsPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/unit/folderTreeData.test.ts`

- [ ] **Step 1: Write folder tree data tests**

Add a helper in `FolderTree.tsx` or `src/lib/folderTree.ts` that builds folders from model relative paths. Test that nested folders are included and empty non-model folders are not shown.

- [ ] **Step 2: Implement first-run screen**

Create `FirstRun.tsx` with a folder select button. On success, save settings with the selected path and trigger scan.

- [ ] **Step 3: Implement folder tree**

Create `FolderTree.tsx` with All, nested folder buttons, selected-folder state, and include-subfolders toggle. Toggle changes must call settings save so state persists.

- [ ] **Step 4: Implement model grid**

Create `ModelGrid.tsx` with card layout, selected state, extension chip, file size, folder label, and search input.

- [ ] **Step 5: Implement details panel without 3D viewer**

Create `DetailsPanel.tsx` showing selected file metadata, parse errors, and disabled slicer action placeholders when slicers are not configured.

- [ ] **Step 6: Wire App state**

Update `App.tsx` to load settings, scan library, store models, apply filtering, and pass state to components.

- [ ] **Step 7: Style the shell**

Update `styles.css` for a desktop app layout with dense but readable panels, stable grid cards, and no marketing-style landing page.

- [ ] **Step 8: Run tests and build**

```powershell
npm test -- tests/unit/folderTreeData.test.ts tests/unit/folderFilters.test.ts
npm run build
```

Expected: tests pass and build succeeds.

- [ ] **Step 9: Commit**

```powershell
git add src/components src/App.tsx src/styles.css tests/unit/folderTreeData.test.ts
git commit -m "feat: build library browsing interface"
```

---

### Task 6: Three.js Model Preview

**Files:**
- Create: `src/components/ModelViewer.tsx`
- Modify: `src/components/DetailsPanel.tsx`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/shared/preload.d.ts`

- [ ] **Step 1: Add model file read IPC**

Add IPC handler `model:read-file` that reads the selected STL or 3MF file as an `ArrayBuffer` for the renderer. Reject paths outside the configured library root.

- [ ] **Step 2: Expose file read API**

Update preload types to expose:

```ts
window.modelLibrary.readModelFile(absolutePath);
```

- [ ] **Step 3: Implement STL preview**

Create `ModelViewer.tsx` using `Canvas` from `@react-three/fiber`, `OrbitControls`, and `STLLoader` from Three examples. Load the selected STL bytes into a geometry, center it, and display it with neutral lighting.

- [ ] **Step 4: Implement 3MF preview path**

Use `ThreeMFLoader` from Three examples for 3MF bytes. If loader support is limited for a file, show the parse error in the viewer area and keep the detail panel usable.

- [ ] **Step 5: Add reset view behavior**

Include a reset view button that remounts or resets camera controls to the default view.

- [ ] **Step 6: Wire viewer into details panel**

Update `DetailsPanel.tsx` to render `ModelViewer` for the selected model and show a clear empty state when no model is selected.

- [ ] **Step 7: Manual verification**

Run:

```powershell
npm run build
npm run electron:dev
```

Expected: app launches, selecting a valid STL displays a rotatable model, and a corrupt model shows a readable viewer error.

- [ ] **Step 8: Commit**

```powershell
git add src/components/ModelViewer.tsx src/components/DetailsPanel.tsx electron/main.ts electron/preload.ts src/shared/preload.d.ts
git commit -m "feat: add 3d model preview"
```

---

### Task 7: Slicer Settings And Launching

**Files:**
- Create: `electron/services/slicerLauncher.ts`
- Create: `src/components/SettingsDialog.tsx`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/shared/preload.d.ts`
- Modify: `src/components/DetailsPanel.tsx`
- Modify: `src/App.tsx`
- Test: `tests/unit/slicerLauncher.test.ts`

- [ ] **Step 1: Write slicer launcher tests**

Test that missing executable paths return a setup error, non-existing executable paths return an invalid path error, and valid executable paths call the process spawn wrapper with the model path as a single argument.

- [ ] **Step 2: Implement slicer launcher**

Create `slicerLauncher.ts` with:

```ts
export async function launchSlicer(
  slicer: SlicerConfig,
  modelPath: string,
  spawnProcess = spawn
): Promise<SlicerLaunchResult>
```

Validate enabled state, executable path, path existence, and file existence before spawning with `[modelPath]`.

- [ ] **Step 3: Add IPC handlers**

Add:

```ts
settings:choose-slicer-executable
slicer:launch
```

The executable picker should use Electron `dialog.showOpenDialog` with Windows executable filters.

- [ ] **Step 4: Implement settings dialog**

Create `SettingsDialog.tsx` with library folder controls, include-subfolders toggle, and rows for Cura and Creality Print. Each row shows name, configured path, enabled checkbox, and choose executable button.

- [ ] **Step 5: Wire slicer actions**

Update `DetailsPanel.tsx` to show enabled slicer buttons for the selected model. If no enabled slicer has a valid path, show setup actions that open settings.

- [ ] **Step 6: Run tests and build**

```powershell
npm test -- tests/unit/slicerLauncher.test.ts
npm run build
```

Expected: tests pass and build succeeds.

- [ ] **Step 7: Manual verification**

Configure a harmless executable such as `notepad.exe` as a temporary slicer path, select a model, and verify the process receives the model path. Then configure actual Cura or Creality Print if installed.

- [ ] **Step 8: Commit**

```powershell
git add electron/services/slicerLauncher.ts src/components/SettingsDialog.tsx electron/main.ts electron/preload.ts src/shared/preload.d.ts src/components/DetailsPanel.tsx src/App.tsx tests/unit/slicerLauncher.test.ts
git commit -m "feat: configure and launch slicers"
```

---

### Task 8: Polish, Resilience, And Final Verification

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/*.tsx`
- Modify: `src/styles.css`
- Modify: `README.md`

- [ ] **Step 1: Add loading and empty states**

Show clear states for scanning, empty folder, no selected model, missing saved library folder, and scan errors.

- [ ] **Step 2: Add refresh action**

Add a refresh button that reruns the library scan without changing settings.

- [ ] **Step 3: Add README**

Create `README.md` with:

```md
# 3D Model Library

Windows desktop app for browsing STL and 3MF model libraries, previewing models, and opening selected files in slicers.

## Development

Install dependencies:

```powershell
npm install
```

Run the app:

```powershell
npm run electron:dev
```

Run tests:

```powershell
npm test
```

Build:

```powershell
npm run build
```
```

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm test
npm run build
npm run electron:dev
```

Expected: unit tests pass, build succeeds, and the desktop app opens.

- [ ] **Step 5: Manual acceptance checklist**

Verify:

- first launch asks for a folder;
- selected folder is remembered after restart;
- STL and 3MF files in subfolders appear;
- folder tree filters the grid;
- include-subfolders persists after restart;
- search matches file names and folder paths;
- selecting a model shows metadata and preview or readable error;
- settings allow Cura and Creality Print executable paths;
- selected model can be opened with a configured slicer.

- [ ] **Step 6: Commit**

```powershell
git add README.md src electron tests package.json package-lock.json
git commit -m "chore: polish model library app"
```

---

## Self-Review

- Spec coverage: first-run folder selection, saved folder, recursive STL/3MF scanning, folder tree, include-subfolders persistence, grid metadata, 3D preview, details panel, slicer configuration, slicer launching, and readable errors are covered by Tasks 2 through 8.
- Scope: cloud sync, editing, mesh repair, file management, tags, favorites, and printer profile management remain out of scope.
- Placeholder scan: no task depends on undefined future work; each behavior has an owning task and verification command.
- Type consistency: shared contracts are introduced in Task 2 and reused by scanner, filters, preview, settings, and slicer tasks.
