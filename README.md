# 3D Model Library

Local Windows desktop app for browsing, organizing and previewing 3D-printing files.

The library supports STL, 3MF and geometry-only OBJ models, PNG/JPG/JPEG/WebP reference images, and ZIP/RAR/7Z packages. The app keeps the original files in the folder you choose and is intended to work without cloud sync or account sign-in.

## What It Does

- Browse folders and subfolders in grid or list view.
- Preview STL, 3MF and OBJ geometry, including cached folder mosaics.
- Browse reference images and open them in the default Windows image application.
- Search, sort, filter, tag, favorite and annotate library items.
- Combine type, folder, tag, favorite, note, recent-use, selection and duplicate filters without rescanning the folder.
- Exclude complete folder branches from results while keeping the folder tree available for navigation.
- Move, rename and send files to the Windows Recycle Bin.
- Reveal the library root, folders and individual files in Windows Explorer.
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

## Large Libraries

Each library keeps a rebuildable catalog snapshot in its own hidden `.3d-model-library` folder so a previously scanned grid can appear immediately on the next launch. The app then checks the real files in the background; files on disk always remain authoritative. Search, sort and filter changes operate on the in-memory catalog and do not start another disk scan.

Generated STL/3MF/OBJ thumbnails are cached locally and reused until the file size, modification time or renderer version changes. Images use their source pixels directly and never enter the WebGL render queue. Archives bypass both image decoding and generated rendering. Only visible and nearby rows are mounted, and visible thumbnails are processed before background folder mosaics.

OBJ support is intentionally geometry-only: material libraries, external textures, points and lines are ignored. To keep the interface responsive, OBJ preview input is limited to 64 MiB, 1,000,000 lines, 500,000 vertices, 500,000 faces and 1,500,000 face references. A model beyond those limits remains organized in the library but shows a safe preview-limit error.

Folder monitoring is enabled by default and can be turned off in Settings. The Refresh button always performs a manual reconciliation, including when monitoring is disabled or unavailable.

### Thumbnail benchmark

Developers can measure cold-cache, warm-cache and rapid-scroll thumbnail behavior against a real library:

```powershell
npm run build
npm run benchmark:thumbnails -- --library "C:\Models" --scenario cold
npm run benchmark:thumbnails -- --library "C:\Models" --scenario warm
npm run benchmark:thumbnails -- --library "C:\Models" --scenario scroll
```

The benchmark uses a disposable application profile and an in-memory index while reconciliation proceeds. It does not start folder monitoring and does not write to the selected library. Its hidden renderer runs without background throttling. Reports are stored in the ignored `benchmark-results` directory and contain aggregate counts and timings only: no model names, filenames or library paths. The current reference run is documented in [the thumbnail benchmark baseline](docs/performance/thumbnail-benchmark-baseline.md).

## Dados e backup

As notas, tags, favoritos e o histórico recente de abertura nos slicers ficam junto da própria biblioteca, no arquivo oculto e durável:

```text
.3d-model-library\3D_LIBRARY_DATA_DO_NOT_DELETE.json
```

O catálogo usado para acelerar a abertura também fica nessa pasta, mas pode ser reconstruído:

```text
.3d-model-library\LIBRARY_INDEX_DO_NOT_DELETE.json
```

- Ao copiar ou fazer backup da biblioteca, leve a pasta `.3d-model-library` junto com todos os arquivos da biblioteca.
- O arquivo com final `.bak` é uma recuperação automática do último estado válido; ele não representa uma segunda biblioteca.
- `3D_LIBRARY_DATA_DO_NOT_DELETE.json` contém dados duráveis. Não o apague para tentar corrigir uma indexação: isso remove a fonte portátil de notas, tags e favoritos.
- `LIBRARY_INDEX_DO_NOT_DELETE.json` contém somente o catálogo reconstruível. Se o catálogo estiver corrompido, feche o aplicativo, apague somente esse arquivo e abra a biblioteca novamente para refazer a varredura.
- Caminhos dos slicers, tema e miniaturas continuam locais ao Windows porque pertencem àquele computador ou podem ser recriados. Preferências visuais por biblioteca, como tipos visíveis e pastas excluídas, também são locais ao aplicativo.
- Se a biblioteca estiver desconectada ou sem permissão de escrita, notas, tags e favoritos ficam bloqueados para evitar alterações que aparentem estar salvas.
- A migração mantém o arquivo antigo de metadados no AppData; ele não é apagado automaticamente.

Para recuperar o ambiente em outro computador, restaure a biblioteca inteira incluindo `.3d-model-library`, escolha essa pasta no aplicativo e aguarde a reconciliação. Se apenas o índice reconstruível estiver danificado, preserve o arquivo de dados duráveis e remova somente `LIBRARY_INDEX_DO_NOT_DELETE.json`.

Na aba **Info** do item selecionado, a linha **Localização** mostra o caminho dentro da biblioteca e oferece ações para copiar o caminho completo ou revelar o arquivo no Explorer. O menu de contexto das pastas também pode revelar a raiz ou uma subpasta.

## Format Behavior

| Format | Thumbnail/preview | Default double-click | Slicer |
| --- | --- | --- | --- |
| STL, 3MF | Generated 3D preview | Configured default slicer | Yes |
| OBJ | Bounded geometry-only 3D preview | Select/load preview in the app | No |
| PNG, JPG, JPEG, WebP | Direct image thumbnail | Default Windows image application | No |
| ZIP, RAR, 7Z | Archive placeholder and inspection | Inspect inside the app | No |

RAR and 7Z inspection/extraction require a compatible external extractor. Opening images and revealing folders are validated against the currently active library before Windows receives the request.

## Privacy And Safety

- The library folder is selected on first launch and stored locally in the app settings.
- Model files remain in their original folders unless you explicitly move, rename, extract, convert or send them to the Recycle Bin.
- External drag-and-drop copies the file to the target application; it does not remove the original.
- Image opening, OBJ reads and Explorer reveal reject paths outside the active library and stale library sessions.
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
