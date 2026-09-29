# Security and Release Readiness Design

## Goal

Harden the desktop application before packaging while preserving its existing library workflows, native file drag to Cura and Creality Print, and responsive browsing performance. Add an accurate filtered-result count without expanding the feature scope.

## Scope

This pass covers five independently reversible stages:

1. BrowserWindow navigation and content hardening.
2. Filesystem and archive boundary hardening.
3. Filtered-result count in the library toolbar.
4. Electron runtime upgrade and regression validation.
5. Targeted dependency remediation.

Installer creation, code signing, automatic updates, cache-orphan indexing, React upgrades, and Three.js upgrades remain out of scope.

## Window Security

The application continues to load `http://127.0.0.1:5173` only in development and the built renderer file in production. The BrowserWindow will explicitly enable sandboxing and disable navigation caused by dropped files. Subsequent top-level navigation is denied unless it matches the exact expected development origin or production renderer entry. Renderer-created windows are denied.

A Content Security Policy will be added for the production renderer. Development allowances will be limited to the local Vite origin and its connection requirements. The policy must continue to permit local bundled scripts, workers, data/blob thumbnail images, and the existing Three.js renderer without permitting arbitrary remote scripts.

These controls affect web navigation only. Native drag-out remains implemented through `webContents.startDrag` in the main process and retains its existing synchronous IPC gesture.

## Filesystem Boundaries

All privileged reads will use a shared canonical-path check that resolves both the active library root and the requested existing file with `realpath`. The canonical result must remain strictly inside the canonical library root and must be a regular file. This closes junction and symlink escapes while preserving ordinary Windows paths.

Operations that intentionally create new destinations continue to validate the canonical existing parent plus a normalized child name, because the destination itself does not exist yet. Existing specialized image, OBJ, organizer, and drag protections remain in place.

The configured archive extractor must resolve to a regular, non-symlinked executable with an accepted 7-Zip executable name. It is executed with argument arrays and never through a shell.

## Archive Safety

7-Zip remains the preferred listing and extraction engine. Before extraction, the listing is validated with limits for entry count, individual uncompressed size, and total uncompressed size. Unsafe paths and duplicate destinations remain rejected.

The built-in ZIP fallback will no longer inflate an unbounded archive synchronously. It will use a bounded path that rejects archives exceeding configured compressed, entry, per-entry, or total expansion limits before writing files. A rejected archive produces an actionable message recommending 7-Zip rather than freezing the app. RAR and 7Z continue to require 7-Zip.

Limits will be constants with focused tests, chosen high enough for ordinary model packages but low enough to prevent accidental multi-gigabyte expansion in memory.

## Result Count

The library toolbar will display model-file counts only; folder cards are excluded.

- With no active filters: `{visible} models`.
- With search, type, tag, favorite, selected, duplicate, note, usage, or folder-exclusion filters: `{visible} of {scopeTotal} models`.

`scopeTotal` means the models available in the current folder scope after the current include-subfolders rule, but before user filters. The count updates immediately and is localized in Portuguese and English. It remains compact at narrow widths and may wrap with the existing toolbar status group without overlapping controls.

## Electron Upgrade

The runtime upgrade is a dedicated commit after the preceding protections pass. Electron will move from 33.2.1 to a currently patched stable release compatible with the project toolchain. No React, React Three Fiber, Three.js, or unrelated major upgrades are bundled with it.

Automated acceptance includes the complete test suite and production build. Manual acceptance requires dragging STL and 3MF files from the application into both Cura and Creality Print. If native drag regresses, only the Electron upgrade commit is reverted; all earlier hardening remains.

The Kaspersky exclusion may need reconfirmation if it is certificate- or hash-based rather than path-based.

## Dependency Remediation

Dependency work is driven by reachable behavior, not the raw audit count. Direct and production-reachable advisories are handled first. Test/build-only advisories are updated only when compatible with the existing Node and Vite setup. `npm audit fix --force` will not be used.

Major React and Three.js ecosystem upgrades are explicitly deferred because they have a larger visual and 3D regression surface than this security pass.

## Testing

Each stage follows test-first development and lands as a separate commit.

- Window contract tests verify sandboxing, navigation denial, window-open denial, and CSP presence.
- Filesystem tests cover normal files, outside paths, junction/symlink escapes, missing files, and directories.
- Archive tests cover traversal, duplicate destinations, excessive entries, oversized entries, excessive totals, malformed ZIPs, and extractor validation.
- Renderer tests verify filtered and unfiltered counts in Portuguese and English and responsive layout contracts.
- The full unit suite and production build run after every stage.
- Native drag receives one final manual check in Cura and Creality Print after the Electron-only commit.

## Rollback

Every stage is committed independently. Window hardening, archive/path hardening, result count, Electron upgrade, and dependency remediation can each be reverted without reverting the others. No library model, metadata, portable index, or thumbnail cache format changes in this pass.
