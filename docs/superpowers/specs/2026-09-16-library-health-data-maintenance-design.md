# Library Health and Data Maintenance Design

## Objective

Add a quiet, trustworthy maintenance surface for the active library without
adding permanent controls to the main browsing interface. The feature protects
durable metadata, explains actionable library problems, and exposes safe repair
operations while preserving the application's local, folder-first design.

This phase also closes two Electron security gaps that do not depend on the
future installer: privileged IPC sender validation and denial of unused browser
permissions.

## Scope

This phase includes:

- a new **Data and maintenance** settings tab;
- metadata backup export and validated restore;
- automatic preservation of the current metadata before restore;
- opening the active library's hidden data directory;
- rebuilding the disposable library index without modifying durable metadata;
- removing invalid, expired, and provably orphaned thumbnail cache entries while
  preserving valid entries owned by other libraries;
- a read-only library health check and compact issue list;
- bounded per-model thumbnail failure tracking for the active session;
- health information from scans, metadata availability, thumbnail generation,
  and configured slicers;
- validation of privileged IPC senders;
- an explicit deny policy for browser permissions the app does not use.

This phase does not include:

- content-hash relinking after files are moved outside the app;
- saved searches or smart collections;
- plate-aware 3MF navigation;
- archive-wide thumbnail indexing;
- an installer, automatic updates, code signing, or package-time Electron fuses;
- cloud services, accounts, telemetry, or a database.

## User Experience

### Settings placement

Settings gains one tab named **Data and maintenance**. It contains three
unframed sections and follows the existing responsive dialog patterns.

1. **Library data** shows the metadata state, source, last successful write,
   and actions to export, restore, and open the hidden data directory.
2. **Maintenance** offers Verify library, Rebuild index, and Clean unused
   thumbnails. Destructive or potentially disruptive actions require a clear
   confirmation and explain exactly what they leave untouched.
3. **Problems found** shows a compact summary followed by actionable issue rows.
   The normal state is a short success message rather than an empty dashboard.

The main library screen remains unchanged during normal operation. A small
attention indicator may appear next to Settings only when an issue requires
user action. Informational activity and successful maintenance never add a
persistent badge.

### Progress and feedback

Maintenance actions use the existing global operation feedback and expose
determinate progress where the underlying operation can count work. Buttons are
disabled only for the conflicting operation, not for the whole settings dialog.
Completion refreshes the health snapshot for the same active library session.
Results from a stale session are discarded.

Errors use plain language and never claim that repair succeeded merely because
an operation started. Detailed technical text remains available through the
existing diagnostics copy action.

## Backup Model

### Export

An export contains only durable library metadata:

- tag catalog;
- per-model tags, notes, and favorites;
- recent slicer-open history.

The export uses the existing portable metadata schema, whose model paths are
relative to the library root. The save dialog proposes a readable, timestamped
filename. Absolute Windows paths, thumbnails, the disposable index, application
settings, slicer executable paths, and model files are excluded.

The application validates and serializes the current in-memory metadata through
the same codec used for normal persistence. Export uses an explicit user-chosen
destination and an atomic temporary-file replacement.

### Restore

Restore is staged:

1. Select a backup file.
2. Enforce the metadata size limit and parse it as untrusted input.
3. Validate schema version, timestamps, bounded strings, and every relative
   path with the existing portable decoder.
4. Present the backup date, item counts, and whether its library identity
   matches the active library.
5. Ask for explicit confirmation.
6. Preserve the current valid manifest as a timestamped recovery snapshot.
7. Atomically install the restored manifest using the active library's identity
   and root, then refresh metadata in the renderer.

A backup from another library may be restored because the intended recovery
case includes moving a library to another computer. The mismatch is visible in
the confirmation. Relative entries that do not currently have a matching file
remain metadata records and are reported by the health check; restore does not
silently discard them.

Recovery snapshots live in the hidden metadata directory. A small retention
limit keeps the newest snapshots and removes only older snapshots created by
this feature. The primary manifest and its rolling `.bak` remain governed by
the existing repository.

Restore is unavailable when the active library is disconnected or read-only.
Export remains available whenever valid metadata is loaded, including from the
read-only local mirror.

## Maintenance Operations

### Verify library

Verification is read-only. It reconciles the active scan result with durable
metadata and integration state, producing issues without changing model files,
metadata, thumbnails, or settings.

The initial health sources are:

- scanner errors and unavailable paths;
- metadata state, including backup recovery, corruption, and read-only access;
- durable metadata entries whose relative files are missing;
- bounded per-model thumbnail failures observed in the active session;
- configured and enabled slicers whose executable is unavailable;
- folder monitoring failures already reported by the active session.

Archive read failures remain operation errors unless an archive is opened
during the current session. They are not proactively scanned because doing so
would make verification expensive.

Each issue has a stable category, severity, localized summary, optional safe
path label, and an action only when the app has a specific recovery operation.
The health UI does not offer generic “fix all”.

### Rebuild index

Rebuild invalidates only `LIBRARY_INDEX_DO_NOT_DELETE.json`, clears the active
renderer catalog, and requests a full scan for the same library session. It
does not remove `3D_LIBRARY_DATA_DO_NOT_DELETE.json`, recovery snapshots,
thumbnails, tags, notes, favorites, or model files.

The operation requires confirmation. If invalidation succeeds but scanning
fails, the application reports the failure and can rebuild the index on the
next scan; durable data remains unaffected.

### Clean unused thumbnails

Cache cleanup must not infer ownership from an irreversible cache filename.
New cache publications therefore record bounded ownership metadata containing
the cache key, library identity, source-relative path, signature, renderer
version, and last access time. The ownership record contains no absolute path.

Cleanup may remove:

- malformed image files;
- abandoned temporary files;
- expired entries under the existing age policy;
- over-budget least-recently-used entries;
- entries explicitly owned by the active library whose source file no longer
  exists or whose current signature no longer matches.

Entries owned by another library are preserved. Legacy entries without
ownership metadata continue to use age and size pruning and are never declared
orphaned solely because the active library does not reference them. The result
reports removed file count and reclaimed bytes.

## Health State

A small coordinator composes existing service state rather than replacing the
scanner, metadata repository, thumbnail cache, or slicer discovery services.
Its public snapshot contains:

- active library session identity;
- last verification time;
- summary counts by severity and category;
- a bounded array of issues;
- whether maintenance actions are currently available.

Thumbnail failure tracking is session-scoped and bounded. A successful retry
removes the corresponding issue. Switching libraries clears the active failure
registry so paths and failures never leak between libraries.

The coordinator does not persist transient errors into durable library
metadata. Durable recovery files remain focused on user-authored information.

## Security Boundaries

Every privileged IPC handler validates that the sender frame belongs to the
exact active renderer origin or production renderer document. Validation is
centralized in a wrapper so new handlers are secure by default. Benchmark-only
handlers use their own explicit trusted renderer identity.

The default Electron session denies all permission requests because the app
does not require camera, microphone, geolocation, notifications, MIDI,
Bluetooth, clipboard-read, or other browser permissions. The diagnostics copy
action is migrated from `navigator.clipboard` to the existing narrow preload
copy-text method, so clipboard writes do not rely on a browser permission grant.

New maintenance IPC methods accept a current `LibrarySessionRef` and validate
it immediately before committing filesystem changes. Dialog-selected files are
still treated as untrusted input. Restore input is size-bounded and decoded
before any destination file is modified.

The preload exposes only task-specific methods and serializable values. Raw
`ipcRenderer`, filesystem primitives, dialogs, or shell APIs are not exposed.

Package-time fuses, ASAR integrity, installer signing, and updater trust belong
to the installer phase because they require a packaged executable. This phase
records but does not simulate those protections in development.

## Components and Interfaces

The implementation extends existing boundaries:

- `portableMetadataRepository` gains explicit export, restore, snapshot
  retention, and status inspection operations;
- `activeLibraryMetadataStore` coordinates restore with its mutation queue and
  republishes the restored state to the local mirror;
- `libraryIndexStore` gains a session-safe invalidation operation;
- `thumbnailCache` gains ownership records, inspection, and cleanup reporting;
- a focused library-health service composes issue sources;
- the preload gains narrow methods for health, backup, restore, maintenance,
  and opening the internal data directory;
- `SettingsDialog` gains the new tab and receives state/actions from `App`;
- centralized IPC registration validates senders before invoking handlers.

The renderer does not directly read backup files, delete index files, inspect
cache directories, or open arbitrary filesystem paths.

## Error Handling

- All writes use temporary files and atomic replacement where supported.
- Restore never modifies the current manifest before validation and automatic
  snapshot creation complete.
- Partial cache cleanup is acceptable and reported honestly; it never affects
  model files or durable metadata.
- Cancellation of an open/save dialog is a neutral result, not an error.
- Stale library sessions cannot publish health, metadata, index, or cleanup
  results into the newly active library.
- A failed health source produces a diagnostic issue while allowing independent
  checks to complete.
- Native drag code and its synchronous gesture path are not changed.

## Testing and Acceptance

Automated coverage includes:

- export contains relative durable metadata and excludes private/global data;
- malformed, oversized, traversal, and unsupported-version backups are rejected;
- cross-library restore requires the mismatch state and preserves relative data;
- restore snapshots the previous valid state before atomic replacement;
- failed restore leaves the active metadata unchanged;
- mutation ordering remains correct during restore;
- index rebuild never removes durable metadata;
- cache cleanup preserves other-library and unknown legacy entries;
- stale-session maintenance results are rejected;
- health aggregation is bounded, localized at the UI boundary, and clears a
  thumbnail issue after successful retry;
- all privileged production IPC channels reject an untrusted sender;
- browser permissions are denied;
- settings remain responsive at existing desktop breakpoints;
- the full test suite and production build pass.

Manual acceptance covers:

- exporting and restoring notes, tags, favorites, and history;
- restoring after moving a library to another Windows path;
- rebuilding an index while preserving metadata and models;
- cleaning cache with two previously opened libraries;
- observing and retrying a failed thumbnail;
- detecting an unavailable slicer;
- switching libraries during a running verification;
- confirming STL/3MF drag to Cura and Creality Print, external drag to Explorer,
  and internal folder movement still work.

## Delivery Order

1. Central IPC sender validation and permission denial.
2. Repository-level backup export, restore, snapshots, and status.
3. Session-safe index invalidation.
4. Thumbnail ownership and cleanup.
5. Library health aggregation and failure registry.
6. Data and maintenance settings UI.
7. Full automated verification and manual drag regression check.
