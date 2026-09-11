# Library Switching, Filters, Images, and OBJ Design

## Goal

Make each selected model library behave as an isolated, self-contained catalog while expanding browsing to OBJ models and common images. Switching folders must never mix files, metadata, thumbnails, filters, or delayed scan results from the previous library.

This phase also adds composable file-type and excluded-folder filters, folder reveal actions, and lightweight image handling without weakening the existing STL, 3MF, archive, drag-and-drop, or thumbnail-performance behavior.

## Scope

This phase covers:

- atomic switching between library roots;
- a rebuildable catalog snapshot stored in the library's hidden internal directory;
- generation tokens that reject stale asynchronous work;
- filters for model, image, and archive types;
- recursive exclusion of chosen folders from collection results;
- PNG, JPG, JPEG, and WebP discovery and thumbnails;
- geometry-only OBJ thumbnails and 3D preview;
- opening images with the Windows default application;
- revealing folders, including the library root, in Windows Explorer;
- persistence of view preferences per library;
- focused regression and real-library validation.

This phase does not add OBJ material or texture loading, an internal image viewer, image editing, archive-format changes, or packaging.

## Chosen Approach

Use one unified catalog per library. Every supported file participates in the same scan and organization model, while filters determine what appears in the collection. This preserves one navigation model and one set of move, rename, trash, drag, and reveal operations.

Separate catalogs per file category were rejected because they would fragment navigation and duplicate scanning, watching, selection, and organization logic. Adding the new formats as isolated patches was rejected because it would leave the current library-switching race intact.

## Library-Owned Data

The selected root contains one hidden internal directory:

```text
<library-root>\
  .3d-model-library\
    3D_LIBRARY_DATA_DO_NOT_DELETE.json
    3D_LIBRARY_DATA_DO_NOT_DELETE.json.bak
    LIBRARY_INDEX_DO_NOT_DELETE.json
```

`3D_LIBRARY_DATA_DO_NOT_DELETE.json` remains the authoritative portable source for notes, tags, favorites, tag definitions, and slicer-open history as defined by the portable metadata design.

`LIBRARY_INDEX_DO_NOT_DELETE.json` is a rebuildable catalog snapshot. It stores only normalized relative paths and inexpensive filesystem facts needed to restore the grid quickly, such as file type, size, and modification time. It never stores absolute paths, usernames, model contents, image contents, or machine-specific slicer configuration.

The index is replaceable and may be deleted without losing notes, tags, or favorites. Thumbnail image data remains in the application cache, keyed by library identity and file signature, to avoid filling the model library with generated images.

The scanner and watcher ignore the complete `.3d-model-library` subtree. Writing metadata or an index cannot trigger a library refresh loop or expose internal files in the interface.

## Atomic Library Switching

Each active library receives a monotonically increasing session generation. Every scan, watch event, catalog read, thumbnail request, preview request, and metadata load captures that generation and the canonical root path.

Changing the root follows one coordinated transition:

1. Canonicalize and validate the new directory.
2. Advance the session generation immediately.
3. Stop the old filesystem watcher and prevent new work for the old root.
4. Clear selection, folder navigation, search text, transient drag state, preview, collection results, and in-memory folder structures.
5. Bind a new metadata store and catalog service to the new canonical root.
6. Restore the new library's valid catalog snapshot so the grid can appear quickly.
7. Start its watcher and reconcile the snapshot with the real filesystem in the background.
8. Persist a replacement snapshot only after successful reconciliation.

Any asynchronous result whose generation or canonical root does not match the active session is discarded before it can update state or write an index. This applies even when the user switches folders repeatedly while scanning or generating thumbnails.

The previous library's files and metadata remain untouched. Returning to it restores only its own catalog and metadata. If the new root is missing, unreadable, or invalid, the app reports the failure and does not silently fall back to data from the previous root.

## Catalog Recovery

The catalog snapshot has an explicit schema version and stable library identifier. Loading rejects oversized, malformed, incompatible, absolute, or path-traversing entries. Unknown supported future fields are ignored conservatively.

If the snapshot is absent or invalid, the app starts with an empty collection and rebuilds it from the filesystem. A corrupt rebuildable index does not affect the portable metadata manifest. Index writes use a temporary file and atomic replacement so an interrupted write cannot leave a partially written primary file.

When a file is moved, renamed, or sent to the Windows Recycle Bin, the active in-memory catalog updates only after the filesystem operation succeeds. The next serialized index write captures the resulting state.

## Supported File Categories

The catalog recognizes these categories and extensions:

- Models: `.stl`, `.3mf`, `.obj`
- Images: `.png`, `.jpg`, `.jpeg`, `.webp`
- Archives: `.zip`, `.rar`, `.7z`

Extension matching is case-insensitive. Unsupported files remain outside the catalog, counts, collection, and drag selection.

All supported files use the existing safe organization operations where applicable: selection, multi-selection, rename, move, native external drag, Recycle Bin, and reveal in Explorer. Images and OBJ files are not sent automatically to a slicer unless that slicer integration explicitly declares support for the format.

## Filters

Replace the narrow STL/3MF type filter with a composable file-visibility model. The filter surface has three category rows with child extension choices:

- Models: STL, 3MF, OBJ
- Images: PNG, JPG/JPEG, WebP
- Archives: ZIP, RAR, 7Z

Toggling a category selects or clears all child formats. A mixed category shows an indeterminate state. At least one format may remain visible, but the empty state is also valid and explains that all file types are hidden rather than implying the library is empty.

Type visibility combines with search, tags, favorites, note presence, dates, selected folder, and the existing subfolder setting using logical AND. Multiple selected tags retain their established matching semantics.

### Excluded Folders

Folder context menus gain `Ocultar dos resultados`. Excluding a folder removes that folder's files and every descendant folder's files from collection results. The folder remains visible and navigable in the sidebar tree so the user can reach it and reverse the choice.

Active exclusions appear as removable chips in the filter summary at the top. Each chip displays a concise relative folder path to distinguish folders with the same name. `Limpar filtros` clears type restrictions, excluded folders, and other active collection filters in one action.

Filter preferences are stored per library ID in machine settings. Switching roots restores the new library's own preferences and never reuses exclusions by raw absolute path. Missing excluded folders are removed during reconciliation. These preferences are convenient view state, not portable model metadata.

## Images

Image cards use the source file itself for their thumbnail. The thumbnail service decodes images only when they are selected, visible, or near the virtualized viewport, and retains them under the same bounded memory policy used by model thumbnails.

An invalid or unsupported image payload settles only that thumbnail request and leaves a stable image placeholder. It does not retry continuously or block later files.

Double-clicking an image asks Electron to open the physical file with the Windows default application after applying the same canonical-root and existence checks used by other external actions. The details panel continues to expose rename, move, trash, drag, copy path, and reveal actions. No internal full-screen image viewer is introduced.

## OBJ Preview

OBJ support uses Three.js `OBJLoader` for geometry parsing. The first version intentionally ignores companion `.mtl` files and external texture references. All loaded meshes receive the application's neutral preview material, consistent lighting, bounds fitting, floor placement, and camera controls used by STL previews.

The loader combines or groups all valid geometry from the OBJ without collapsing object transforms. Empty or malformed files produce the standard preview error state. OBJ parsing enters the existing prioritized thumbnail service, so selected and visible files outrank nearby and historical work.

OBJ files receive generated thumbnails through the shared WebGL renderer and persistent cache. Their cache identity includes file path, size, modification time, renderer version, and format so stale thumbnails are not reused.

## Explorer Integration

Every folder context menu, including the root entry, gains `Mostrar no Explorer`. Electron validates that the canonical target is the active library root or one of its descendant directories, then opens that directory in Windows Explorer.

For model, image, and archive files, the existing reveal action remains unchanged and selects the file in its parent Explorer window. Long relative locations remain visible in the details panel with the absolute path available through tooltip and copy action.

## Performance and Responsiveness

Restoring the catalog snapshot and reconciling the filesystem remain separate phases. Cached collection data may render before reconciliation, but stale results are never allowed to cross a library-generation boundary.

Image decoding and OBJ parsing share the existing bounded I/O and render queues. Visible work remains higher priority than nearby, folder-mosaic, and historical requests. Fast scrolling cannot create unbounded retained work. Folder mosaics may include model or image thumbnails, but their requests remain lower priority than visible file cards.

Changing type filters or excluded folders filters the in-memory catalog and must not rescan the disk. Changing libraries is the only operation in this phase that replaces the active catalog service.

## Error Handling and Safety

- Canonicalize the library root before opening metadata, catalog, watcher, or file services.
- Resolve relative index entries against that root and reject absolute paths or traversal.
- Reject stale generation results before React state changes and before filesystem writes.
- Never authorize file operations using a cached index entry alone; revalidate the live path.
- Do not follow symlinks outside the canonical library root.
- Keep the prior library untouched when opening a new library fails.
- Never delete files permanently; removal continues through the Windows Recycle Bin.
- A failed thumbnail, OBJ parse, image decode, or catalog write cannot fail the complete scan.
- Report catalog recovery and inaccessible roots with concise actionable messages.
- Store no credentials, slicer paths, personal absolute paths, or generated previews in the portable index.

## Interfaces

Introduce an active-library session object containing the session generation, canonical root, library ID, metadata store, catalog store, watcher handle, and cancellation lifecycle. Renderer-facing library events include both generation and root identity.

Extend the shared file model with a supported extension union and a derived category of `model`, `image`, or `archive`. Capability helpers determine whether a file can be previewed in 3D, thumbnailed directly, opened with Windows, inspected as an archive, converted, or sent to a slicer. Components consume capabilities instead of duplicating extension checks.

The collection filter remains a pure function over catalog entries and a typed filter state containing visible extensions and excluded relative folder paths. Folder exclusion comparison occurs on normalized path segments, not string prefixes, so excluding `parts` does not accidentally exclude `parts-old`.

## Testing

Add focused tests before each behavior change for:

- switching between two roots without file, metadata, selection, preview, or filter leakage;
- rejecting late scans, watcher events, thumbnails, previews, and metadata loads from an old generation;
- rapid repeated switching and failed target-root selection;
- valid, missing, corrupt, oversized, and traversal-containing catalog snapshots;
- atomic index replacement and scanner/watcher exclusion of the hidden directory;
- type category, child extension, mixed-state, empty-state, and combined filters;
- recursive folder exclusion using path segments and removable filter chips;
- per-library view preference restoration and missing-exclusion cleanup;
- PNG, JPG, JPEG, and WebP discovery, lazy thumbnail loading, failure isolation, and Windows opening;
- OBJ discovery, geometry loading, neutral material application, bounds fitting, thumbnail caching, and malformed-file handling;
- safe reveal of root and descendant folders in Explorer;
- unchanged STL, 3MF, archive, folder mosaic, internal drag, and native external drag behavior.

Run the complete unit suite and production build after each coherent slice. Perform a read-only manual validation with at least two temporary libraries before using the real model collection. The real-library validation must not rename, move, delete, convert, or rewrite model files.

## Delivery Order

1. Add shared format/category capabilities and pure filter tests.
2. Introduce the active-library generation boundary and stale-result tests.
3. Add the library-owned rebuildable catalog snapshot and safe recovery.
4. Rework root switching to clear and rebind state atomically.
5. Add category filters, recursive folder exclusions, chips, and per-library preferences.
6. Add image discovery, lazy thumbnails, default-Windows opening, and organization actions.
7. Add geometry-only OBJ parsing to preview and thumbnail pipelines.
8. Add folder reveal actions for root and descendants.
9. Run full regression tests, production build, synthetic two-library switching tests, and read-only real-library validation.

## Acceptance Criteria

- Switching libraries immediately removes the previous collection and never accepts late results from it.
- Each root restores only its own metadata, catalog snapshot, and view preferences.
- Missing or corrupt rebuildable indexes recover without losing notes, tags, or favorites.
- Users can independently show or hide model, image, and archive formats.
- Excluding a folder recursively hides its content from results while leaving it navigable in the tree.
- Active type, tag, and folder exclusions remain visible and removable.
- PNG, JPG/JPEG, and WebP files show lazy thumbnails and open in the Windows default application.
- OBJ files show a neutral geometry thumbnail and interactive 3D preview without requiring MTL or textures.
- Root and nested folders can be opened directly in Windows Explorer.
- Filtering does not rescan the filesystem or cause visible collection stalls.
- Existing STL, 3MF, archive, move, rename, trash, internal drag, native external drag, and thumbnail-priority behavior remains intact.
- All focused tests, the full unit suite, and the production build pass.

## Deferred Work

- OBJ MTL and external texture support.
- Internal image lightbox or editor.
- Custom image thumbnails and contact sheets.
- Saved named filter presets beyond automatic per-library view state.
- Multi-plate and component-aware 3MF navigation.
- Application packaging and installer work.
