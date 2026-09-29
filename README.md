# 3D Model Library

[English](README.md) | [Português (Brasil)](README.pt-BR.md)

A local-first Windows desktop app for browsing, previewing, and organizing large 3D-printing libraries without moving files into a proprietary database.

![Library overview](docs/assets/library-overview.png)

## Why It Exists

Large STL and 3MF collections quickly become difficult to recognize in Windows Explorer. 3D Model Library adds visual previews, fast navigation, tags, notes, archive tools, and slicer integration while keeping the original folder structure as the source of truth.

## Highlights

- Visual grid and list views for large folder trees.
- Cached thumbnails and interactive previews for STL, 3MF, and geometry-only OBJ files.
- Folder mosaics built from the models stored inside each folder.
- Search, sorting, favorites, notes, reusable tags, and combinable filters.
- Move and rename files or folders, with destructive actions sent to the Windows Recycle Bin.
- Native drag and drop to Windows Explorer, Cura, Creality Print, and compatible desktop apps.
- Automatic discovery of popular FDM slicers, plus custom executable configuration.
- ZIP, RAR, and 7Z inspection and extraction workflows.
- Non-blocking 3MF-to-STL conversion.
- English and Brazilian Portuguese interface, light and dark themes, and responsive desktop layouts.
- Portable per-library metadata stored beside the library for backup and migration.

![Selected model and 3D preview](docs/assets/model-preview.png)

## Supported Formats

| Format | Thumbnail / preview | Default action |
| --- | --- | --- |
| STL, 3MF | Generated 3D thumbnail and interactive preview | Open in the configured slicer |
| OBJ | Bounded geometry-only thumbnail and preview | Load in the app |
| PNG, JPG, JPEG, WebP | Source image thumbnail | Open in the default Windows image app |
| ZIP, RAR, 7Z | Archive placeholder and file inspection | Inspect or extract |

OBJ materials, external textures, points, and lines are intentionally ignored. RAR and 7Z inspection requires a compatible extractor such as 7-Zip.

## Local-First Data

The app does not require an account, cloud service, or telemetry endpoint. Model files remain where they are unless you explicitly move, rename, extract, convert, or send them to the Recycle Bin.

Each library stores durable organization data in:

```text
.3d-model-library\3D_LIBRARY_DATA_DO_NOT_DELETE.json
```

This file contains relative paths, tags, notes, favorites, and slicer history. A rebuildable catalog is stored separately in `LIBRARY_INDEX_DO_NOT_DELETE.json`. Back up the hidden `.3d-model-library` folder together with the model library.

External rename recovery uses a streamed SHA-256 identity only for files with saved data. A match is restored only when it is unique; ambiguous duplicates are reported for review instead of being guessed.

See [Backup and recovery](docs/maintenance/library-data-recovery.md) for the full recovery procedure.

## Development Status

The project is under active development and does not have a signed installer or packaged release yet. Run it from source while the application is being finalized.

### Requirements

- Windows 10 or later.
- Node.js 22.12 or later.
- Cura, Creality Print, or another FDM slicer is optional.
- 7-Zip or a compatible extractor is optional for RAR and 7Z archives.

### Run Locally

The easiest Windows setup is to double-click `setup-windows.cmd`. It verifies Node.js, installs the exact locked dependencies, and creates a desktop shortcut. The script does not request administrator access or download anything outside npm.

After setup, use the desktop shortcut or double-click `start-3d-model-library.cmd`.

For a manual setup:

```powershell
npm ci
npm run electron:dev
```

### Verify Changes

```powershell
npm test
npm run build
npm audit --omit=dev
```

### Thumbnail Benchmark

The benchmark uses a disposable app profile and does not write to the selected library:

```powershell
npm run build
npm run benchmark:thumbnails -- --library "C:\Models" --scenario cold
npm run benchmark:thumbnails -- --library "C:\Models" --scenario warm
npm run benchmark:thumbnails -- --library "C:\Models" --scenario scroll
```

Reports contain aggregate counts and timings only. They do not contain model names, filenames, or library paths. See the [benchmark baseline](docs/performance/thumbnail-benchmark-baseline.md).

## Safety Notes

- File operations are validated against the currently active library.
- External drag and drop copies files to the destination; it does not remove the originals.
- Paths outside the active library and stale library sessions are rejected.
- Generated output, local app state, benchmark results, secrets, and native build artifacts are ignored by Git.
- Do not commit model libraries, slicer executables, API keys, tokens, `.env` files, or personal filesystem paths.

For vulnerability reporting and dependency policy, read [SECURITY.md](SECURITY.md).
