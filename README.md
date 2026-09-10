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

## Large Libraries

The app keeps a local index in its application-data folder so a previously scanned library can appear immediately on the next launch. It then checks the real files in the background; the files on disk always remain authoritative.

Generated thumbnails are cached locally and reused until the model's size or modification time changes. Only visible and nearby rows are mounted, and visible thumbnails are rendered before background folder mosaics.

Folder monitoring is enabled by default and can be turned off in Settings. The Refresh button always performs a manual reconciliation, including when monitoring is disabled or unavailable.

## Dados e backup

As notas, tags, favoritos e o histórico recente de abertura nos slicers ficam junto da própria biblioteca, no arquivo oculto:

```text
.3d-model-library\3D_LIBRARY_DATA_DO_NOT_DELETE.json
```

- Ao copiar ou fazer backup da biblioteca, leve a pasta `.3d-model-library` junto com os arquivos STL e 3MF.
- O arquivo com final `.bak` é uma recuperação automática do último estado válido; ele não representa uma segunda biblioteca.
- Caminhos dos slicers, tema, preferências, miniaturas e índices continuam locais ao Windows porque podem ser recriados ou pertencem apenas àquele computador.
- Se a biblioteca estiver desconectada ou sem permissão de escrita, notas, tags e favoritos ficam bloqueados para evitar alterações que aparentem estar salvas.
- A migração mantém o arquivo antigo de metadados no AppData; ele não é apagado automaticamente.

Na aba **Info** do modelo selecionado, a linha **Localização** mostra o caminho dentro da biblioteca e oferece ações para copiar o caminho completo ou revelar o arquivo no Explorer.

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
