# Portable Library Metadata Design

## Goal

Keep durable library organization data with the model library itself so notes, tags, favorites, and usage history survive application reinstalls, Windows formatting, and moving the library to another computer.

The selected library remains a normal folder of STL, 3MF, ZIP, RAR, and 7Z files. The application adds one hidden internal directory at its root:

```text
<library-root>\
  .3d-model-library\
    3D_LIBRARY_DATA_DO_NOT_DELETE.json
    3D_LIBRARY_DATA_DO_NOT_DELETE.json.bak
```

## Data Ownership

The portable manifest is the authoritative source for durable library data:

- model notes;
- model tags;
- favorite state;
- the library tag catalog;
- slicer-open history used by recent and never-opened filters.

Machine-specific settings remain in Electron application data:

- selected library path;
- Cura and Creality Print executable paths;
- default slicer;
- theme, view, and drag preferences;
- archive extractor path;
- monitoring preference.

Rebuildable data also remains in application data:

- filesystem scan index;
- thumbnail cache;
- duplicate hashes.

This keeps the library backup small and portable while avoiding large generated caches beside the user's models.

## Manifest Format

The manifest is UTF-8 JSON with an explicit schema version and stable library identifier.

```json
{
  "schemaVersion": 1,
  "libraryId": "generated-uuid",
  "updatedAt": "2026-09-09T00:00:00.000Z",
  "tagCatalog": ["decoracao", "favorito"],
  "models": {
    "Brinquedos/Fidget/modelo.3mf": {
      "favorite": true,
      "tags": ["favorito"],
      "notes": "Imprimir com suporte lateral"
    }
  },
  "slicerHistory": [
    {
      "relativePath": "Brinquedos/Fidget/modelo.3mf",
      "slicerId": "cura",
      "openedAt": "2026-09-09T00:00:00.000Z"
    }
  ]
}
```

Model keys use normalized paths relative to the library root. They never contain the Windows username or an absolute drive path. Path validation rejects entries that are absolute or escape the library through `..`.

Unknown future fields are ignored when reading. Invalid known fields are normalized conservatively. The schema version prevents silently interpreting an incompatible future format.

## Storage Architecture

Create a portable metadata backend responsible only for reading and writing the manifest. Existing metadata operations continue through the `LibraryMetadataStore` interface, while a path adapter converts between absolute application paths and relative manifest paths.

The active metadata store is bound to the currently selected library. Changing libraries closes the previous store and loads the manifest belonging to the new root, preventing metadata from leaking between libraries.

After every successful portable write, the application updates an application-data mirror keyed by the library ID and root path. The mirror is recovery assistance, not the source of truth. A valid portable manifest always wins.

## Startup And Migration

Startup uses this precedence:

1. valid portable manifest;
2. valid portable `.bak` file, with a recovery warning;
3. legacy `library-metadata.json` from application data, migrated once;
4. a new empty portable manifest.

Legacy migration converts only absolute model paths inside the selected library into relative paths. Entries outside the root are retained in the legacy file but are not copied into the new library manifest. The old application-data file is not deleted.

If migration succeeds, the portable manifest becomes authoritative immediately. Reopening the same library must not duplicate history or tags.

## Safe Writes And Recovery

Writes are serialized per active library. A save follows this sequence:

1. validate and normalize the complete next manifest;
2. write a uniquely named temporary file in `.3d-model-library`;
3. flush and close it;
4. preserve the last valid primary file as `.bak`;
5. atomically replace the primary file;
6. update the application-data mirror.

Concurrent note, tag, favorite, move, rename, and slicer-history changes cannot overwrite each other. Failed writes leave the previous primary or backup intact and return a clear error to the interface.

When the primary is corrupt but the backup is valid, the app loads the backup in memory and shows a recovery warning. Before the next successful metadata edit, it renames the invalid primary to a timestamped `.corrupt` file, preserves the valid `.bak`, and writes a repaired primary. It does not rotate corrupt content over the valid backup or discard evidence silently.

## Hidden Directory Behavior

On Windows, the app applies the filesystem Hidden attribute to `.3d-model-library`. The leading dot also keeps the directory unobtrusive on platforms that follow dot-file conventions.

The scanner and watcher explicitly ignore the entire internal directory. It never appears in the sidebar, folder cards, search results, archive operations, drag targets, or model counts. Metadata writes therefore cannot cause watcher refresh loops.

If the user reveals hidden files, the warning filename communicates that it belongs to the application. The app never interprets arbitrary executable content from this directory.

## Read-Only And Missing Libraries

If the library root is missing, the cached scan may remain visible for reference, but model and metadata mutations are disabled. The interface reports that the library is unavailable.

If model files are readable but the internal directory cannot be written, the app enters metadata read-only mode. Notes, tags, favorites, and history changes are blocked rather than stored provisionally. Opening existing model files remains available.

The app never claims that a metadata change was saved until the portable write succeeds. A manual retry becomes available after permissions or connectivity are restored.

## File Location In The Details Panel

The selected-model information panel gains a `Localização` row containing the complete relative folder and filename. The full absolute path is available as the row tooltip and through a copy action.

Two icon actions accompany the value:

- copy the full path to the clipboard;
- reveal the file in Windows Explorer using the existing safe Electron boundary.

At the library root, the relative display is just the filename. Long paths wrap or truncate without widening the details panel, and the tooltip preserves the complete value.

## Security And Validation

- Canonicalize the selected library root before opening a store.
- Resolve every manifest path against that root and reject path traversal.
- Cap manifest size before parsing to avoid loading an unexpectedly large file.
- Validate JSON shape and string lengths before exposing data to the renderer.
- Write only inside the fixed `.3d-model-library` directory.
- Never follow manifest paths to authorize file operations; current filesystem scan results remain authoritative.
- Do not store slicer executable paths, usernames, credentials, or other machine-specific values in the portable manifest.

## Testing

Automated coverage will include:

- relative-path serialization and absolute-path restoration;
- rejection of absolute and escaping manifest paths;
- atomic write and backup recovery;
- concurrent mutation serialization;
- one-time migration from the current application-data format;
- switching between two libraries without metadata leakage;
- move and rename migration for files and folders;
- read-only and missing-library behavior;
- scanner and watcher exclusion of `.3d-model-library`;
- details-panel location text, copy action, and Explorer reveal action;
- regression coverage for tags, notes, favorites, filters, internal drag, and native external drag.

Manual validation will copy a library to a different absolute path, reopen it, and confirm that its notes, tags, favorites, and history still match the same relative model files.
