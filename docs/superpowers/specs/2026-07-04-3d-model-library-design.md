# 3D Model Library Design

## Goal

Build a Windows desktop app for organizing and previewing a local library of 3D printing model files. The app should make it easy to browse STL and 3MF files visually, understand what each file is before opening it, and launch selected files in slicers such as Cura and Creality Print.

## Platform

The app will be built with Electron, React, and Three.js.

Electron gives the app direct access to local folders, saved settings, and launching external programs. React gives a flexible UI for the library, settings, and detail panels. Three.js provides the 3D preview experience for STL and 3MF models.

## First Run And Settings

On first launch, the app asks the user to choose a main library folder.

After selection, the app saves:

- selected library folder path;
- include-subfolders toggle state;
- configured slicer executable paths;
- future UI preferences that should persist between app launches.

On later launches, the app automatically opens the saved library folder. The user can change the folder from settings.

Settings are stored locally on the Windows machine, scoped to this app.

## Library Scanning

The app scans the selected library folder for:

- `.stl`
- `.3mf`

Scanning includes subfolders by default.

The scanner records metadata for each model:

- file name;
- extension;
- absolute path;
- folder path relative to the library root;
- file size;
- last modified date;
- approximate dimensions when available from parsed geometry;
- object or mesh count when available.

The scanner should tolerate unreadable, corrupt, or unsupported files. Those files remain visible with an error state instead of crashing the app.

## Folder Navigation

The main UI includes a folder tree based on the selected library root.

The tree includes:

- an "All" view for every discovered model;
- each subfolder that contains models or contains other folders with models.

When the user selects a folder, the grid shows models in that folder and its subfolders by default.

An "include subfolders" toggle controls this behavior:

- on: show files in the selected folder and all nested subfolders;
- off: show only files directly inside the selected folder.

The app remembers the toggle state between launches.

## Main Interface

The main screen has three primary regions:

- left folder tree;
- central model grid;
- right detail and 3D preview panel.

The grid shows visual cards for models. Each card includes:

- generated thumbnail or lightweight 3D preview;
- file name;
- extension;
- folder context;
- modified date or file size when useful.

The user can search across the library. Search matches at least file names and folder paths.

Selecting a model updates the detail panel.

## 3D Preview

The selected model opens in a larger Three.js preview.

The preview supports:

- rotate;
- zoom;
- pan;
- reset view.

The detail panel shows:

- file name;
- extension;
- folder path;
- file size;
- modified date;
- approximate dimensions;
- object or mesh count when available;
- parse or preview errors if the file cannot be displayed.

## Slicer Integration

The app supports launching the selected file in external slicers.

The first version includes configurable entries for:

- Cura;
- Creality Print.

Each slicer entry stores:

- display name;
- executable path;
- enabled or disabled state.

The data model should allow adding OrcaSlicer or other slicers later without rewriting the integration.

When a selected model is opened in a slicer, the app starts the configured executable and passes the model file path as an argument.

If a slicer path is missing or invalid, the app shows a clear setup prompt instead of failing silently.

## Error Handling

The app should handle:

- missing saved library folder;
- removed or renamed files;
- inaccessible folders;
- corrupt STL or 3MF files;
- invalid slicer executable paths;
- failed external process launches.

Errors should be shown near the relevant action or file. The main library should remain usable when individual files fail.

## Initial Acceptance Criteria

- On first launch, the app asks for a library folder and saves it.
- On later launches, the app automatically loads the saved folder.
- The app scans `.stl` and `.3mf` files recursively.
- The folder tree filters the grid by folder.
- The include-subfolders toggle changes folder filtering and persists after restart.
- The model grid displays discovered files with useful metadata.
- Selecting a file displays a 3D preview when the file can be parsed.
- Selecting a file displays file details.
- Cura and Creality Print can be configured with executable paths.
- A selected model can be opened with a configured slicer.
- Invalid files or invalid slicer paths produce readable errors without crashing the app.

## Out Of Scope For First Version

- Cloud sync.
- File editing or mesh repair.
- Moving, renaming, or deleting models from inside the app.
- Tagging and favorites.
- Automatic online thumbnails.
- Printer profile management.
- Full slicer automation beyond opening a selected model.
