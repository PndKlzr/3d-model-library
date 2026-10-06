# Security and Release Readiness - 2026-09-16

Last reverified: 2026-09-29

## Scope

This checkpoint covers the Electron window boundary, privileged library reads,
archive extraction limits, dependency security, repository privacy, and the
native drag flows required before installer work begins.

## Applied Controls

- Electron renderer sandbox enabled with context isolation and Node integration disabled.
- Navigation is limited to the exact development origin or production renderer file.
- New renderer windows are denied, and navigation caused by file drops is disabled.
- A restrictive Content Security Policy blocks objects, frames, base changes, and external scripts.
- Privileged model reads resolve real filesystem paths and reject files outside the active library.
- ZIP fallback extraction is asynchronous and bounded before any destination file is written.
- 7-Zip listings are bounded before extraction, and configured extractors must resolve to a regular
  `7z.exe`, `7zz.exe`, or `7za.exe` file without symbolic links.
- Malformed 3MF XML is rejected before metadata or preview geometry is built.
- Every privileged production IPC call validates the exact active renderer origin.
- Browser permission requests are denied because the application does not use camera, microphone,
  notifications, geolocation, MIDI, or similar web permissions.
- Backup restore, index rebuild, verification, data-folder reveal, and thumbnail cleanup reject stale
  library sessions before committing or publishing results.
- External metadata backups are size-bounded, decoded as portable relative paths, and never accept
  symbolic-link input files.
- Thumbnail cleanup is scoped by library ownership and preserves entries belonging to other libraries
  and unknown legacy entries.

## Dependency Audit

- Runtime: Electron `44.4.1`.
- XML parser: `fast-xml-parser` `5.11.1`.
- Test runner: Vitest `5.0.2`.
- Unused development packages `concurrently` and `wait-on` were removed.
- Compatible dependency patches were applied without updating React, React Three Fiber, Drei,
  Three.js, or other direct major UI dependencies.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Full `npm audit`: **0 vulnerabilities**.
- Automated suite: **103 test files and 758 tests passed**.
- Production renderer build: **passed**. Vite reports the existing large-chunk advisory for the
  Three.js renderer and thumbnail worker; this is a performance advisory, not a build failure.

The Vitest 5 migration removed the previous development-only advisories. The development server
remains bound to `127.0.0.1` with a strict port, and Vitest UI is not enabled by project scripts.

## Repository Privacy

Tracked files were scanned for the previous Windows user path, application data paths, common
credential and private-key markers, build output, installer binaries, and native executables.
No personal paths, credentials, model-library content, build directories, or executable artifacts
were found. The unrelated untracked `.superpowers/` directory remains excluded from commits.

Exported metadata backups contain no absolute Windows path. They include only the portable library
identity, relative model paths, tags, notes, favorites, and slicer-open history. They exclude model
files, cached thumbnails, slicer executables, global settings, and view preferences.

## Library Maintenance Evidence

- Portable backup export and restore are validated before writing and use atomic replacement.
- Restore creates a timestamped recovery snapshot and retains the newest five snapshots.
- Read-only verification does not replace the mounted catalog or write a new index.
- Index rebuild invalidates only `LIBRARY_INDEX_DO_NOT_DELETE.json`; durable metadata is preserved.
- Thumbnail cleanup removes only stale images with valid ownership for the active library.
- The renderer keeps one maintenance operation active at a time and ignores results from a library
  that is no longer active.
- Healthy libraries add no permanent warning to the main screen; errors use a small settings indicator.

## Manual Acceptance

The user confirmed the Electron 44 build successfully completed all required gestures:

- STL and 3MF drag to Cura.
- STL and 3MF drag to Creality Print.
- External file drag to Explorer or Desktop.
- Internal model move to a library folder.

The upgraded Electron executable launched successfully after the existing antivirus exclusion and
remained available for the acceptance run.

The new data-maintenance workflow still requires one focused manual acceptance pass: export and
restore a harmless note, rebuild the index, clean unused thumbnails, retry one failed thumbnail, and
confirm another library keeps its valid thumbnails. Automated tests cover session isolation, atomic
restore, snapshot retention, scoped cleanup, and preservation of durable metadata.

## Deferred Work

- Repeat this checklist after installer packaging and code signing are introduced.
- Package-time Electron fuses, ASAR integrity configuration, signing, and updater trust remain part of
  installer work and are not claimed by this checkpoint.
