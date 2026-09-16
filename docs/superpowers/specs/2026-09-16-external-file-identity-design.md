# External File Identity Design

## Goal

Preserve a model's tags, notes, favorite state, and slicer history when the file or one of its parent folders is renamed or moved inside the active library by Windows Explorer.

## Safety Rule

Automatic metadata migration requires a unique content match. A filename, size, timestamp, or watcher timing is never sufficient on its own. When identity is ambiguous, the application keeps the old metadata record recoverable and reports that it needs attention instead of attaching it to the wrong file.

## Chosen Approach

Store a versioned content identity for files that have durable user data. The identity contains the file size and a SHA-256 digest. Size is an inexpensive candidate filter; the digest is the proof of identity.

The alternatives were rejected for these reasons:

- Windows file IDs are fast but volume-specific, awkward across moves, and less portable with the library folder.
- Name, size, and modification-time heuristics can silently attach personal notes to the wrong duplicate.
- Hashing every file on every scan would be safe but unnecessarily expensive for large libraries.

## Persistent Data

The portable metadata document inside `.3d-model-library` gains a versioned identity map keyed by the same normalized absolute paths used by model metadata. Each record contains:

- algorithm: `sha256`
- digest: lowercase hexadecimal SHA-256
- size in bytes
- last confirmed modification time

The local mirror stores the same data. Decoders accept older documents with no identity map and normalize them to an empty map, so existing libraries remain compatible.

Only files with durable user data require a retained identity. Durable data means favorite state, one or more tags, non-empty notes, or slicer history. Empty metadata entries do not trigger hashing.

## Identity Generation

Saving durable metadata succeeds before identity work begins. Hashing remains asynchronous and does not block thumbnail rendering or library navigation, but the edit operation is not reported as fully settled until its identity job finishes. This prevents an invisible metadata write from racing a library copy immediately after an edit. Identity failure never rolls back the already-saved tag or note.

Identity results are committed only when all of these remain true:

- the library session is still current;
- the source path is still inside that library;
- the file size and modification time still match the values captured before hashing.

Activation schedules a gradual backfill only for existing durable metadata records that lack identities. It does not hash the entire library.

## External Rename Reconciliation

The watcher continues to report filesystem events in batches. After applying a batch to the index, reconciliation examines:

1. metadata paths that disappeared during the batch;
2. newly added files in that batch;
3. known identities for the missing paths.

New files are first filtered by size. Their SHA-256 digest is computed only when at least one missing metadata identity has the same size. A migration occurs only when one missing metadata path and one new path share the digest uniquely within the batch and current library.

The metadata record, identity record, and matching slicer-history paths move together in one metadata-store update. Folder renames naturally reconcile multiple unique file pairs. The index is already updated independently, so a failed metadata write never hides the physical files.

## Ambiguous And Interrupted Cases

- Multiple new files with the same digest: do not migrate automatically.
- Multiple missing metadata records with the same digest: do not migrate automatically.
- New path disappears or changes during hashing: discard the result.
- Application closes during reconciliation: old metadata remains saved and is reported as missing on the next run.
- Monitoring disabled: a full scan on refresh or startup performs the same bounded reconciliation against missing durable metadata.
- Move outside the active library: retain the old metadata as recoverable; never follow files outside the library boundary.

The library-health screen distinguishes an unresolved external move from ordinary missing metadata when a saved identity exists. A later manual reconnect action can be added without changing the identity format.

## Internal Operations

Existing in-app rename and move commands remain authoritative and immediate. They migrate metadata and its identity record directly without hashing again. Undo moves both records back. External reconciliation must not race or duplicate these migrations.

## Active Library Consistency

Library switching remains transactional: activate the new canonical root, load its independent metadata and identity map, then persist the selected root. Results from the prior session are rejected by the existing generation checks. Diagnostic exports include the current session root and library ID so the active library can be verified without inferring it from a possibly stale screenshot.

## Performance Boundaries

- One concurrent background hash by default.
- Hashing uses streamed reads and never loads a complete model into memory.
- Thumbnail and selected-preview work retain higher priority.
- Reconciliation hashes only size-matched additions.
- Completed identities are persistent and reused across restarts.

## Tests

Automated coverage will include:

- decoding metadata created before identities existed;
- creating an identity after adding durable metadata;
- rejecting a hash result after the file changes or the library switches;
- reconciling an external file rename;
- reconciling a parent-folder rename containing several tagged files;
- preserving notes, tags, favorite state, identity, and slicer history together;
- refusing ambiguous duplicate-content matches;
- retaining recoverable metadata when a file leaves the library;
- reconciling after a manual refresh when monitoring is disabled;
- persisting and reporting the canonical active library path;
- ensuring internal rename, move, and undo behavior does not regress.

Full unit tests and the production build must pass before the feature is considered complete.
