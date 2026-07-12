# 3D Model Library

Local Windows desktop app for browsing, organizing and previewing 3D-printing files.

It is built for libraries of STL and 3MF models, with support for ZIP, RAR and 7Z packages. The app keeps your files in the folder you choose and is intended to work without cloud sync or account sign-in.

## What It Does

- Browse folders and subfolders in grid or list view.
- Preview STL and 3MF models, including cached folder mosaics.
- Search, sort, filter, tag, favorite and annotate models.
- Move, rename and send files to the Windows Recycle Bin.
- Open models in Cura or Creality Print.
- Drag files to supported Windows applications and Explorer.
- Inspect and extract supported archive formats.
- Convert 3MF models to STL without blocking the interface.

## Requirements

- Windows 10 or later.
- Node.js 20+ for development.
- Cura and/or Creality Print are optional and configured from the app settings.
- 7-Zip or another compatible extractor is optional for RAR and 7Z extraction.

## Development

Install dependencies:

```powershell
npm install
```

Start the desktop app with live reload:

```powershell
npm run electron:dev
```

Run the test suite:

```powershell
npm test
```

Create a production renderer build:

```powershell
npm run build
```

## Privacy And Safety

- The library folder is selected on first launch and stored locally in the app settings.
- Model files remain in their original folders unless you explicitly move, rename, extract, convert or send them to the Recycle Bin.
- External drag-and-drop copies the file to the target application; it does not remove the original.
- The app does not need an account and this repository does not include cloud sync or telemetry code.
- Do not commit model files, slicer executables, `.env` files, API keys, tokens or personal library paths.
- Use generic paths in documentation and tests, such as `C:\Users\Example\Desktop\Models`.

## Repository Hygiene

Generated output and local configuration are ignored by Git, including `node_modules`, build folders, logs, `.env` files, native helper binaries and compiler object files.

Before sharing the repository, run:

```powershell
git status --short
```

Review the staged file list for personal library paths, credentials and generated artifacts before pushing.
