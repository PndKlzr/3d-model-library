# Security and Release Readiness - 2026-09-16

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

## Dependency Audit

- Runtime: Electron `44.4.1`.
- XML parser: `fast-xml-parser` `5.11.1`.
- Unused development packages `concurrently` and `wait-on` were removed.
- Compatible dependency patches were applied without updating React, React Three Fiber, Drei,
  Three.js, or other direct major UI dependencies.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Full `npm audit`: **5 development-only vulnerabilities**: 3 moderate, 1 high, and 1 critical.

The remaining advisories are reachable only through Vitest 2 and its private Vite, vite-node,
esbuild, and mocker dependencies. They are not included in the packaged application. Resolving
them requires the breaking Vitest 5 upgrade, so that migration is deferred to a dedicated tooling
task. The development server remains bound to `127.0.0.1` with a strict port, and Vitest UI is not
enabled by project scripts.

## Repository Privacy

Tracked files were scanned for the previous Windows user path, application data paths, common
credential and private-key markers, build output, installer binaries, and native executables.
No personal paths, credentials, model-library content, build directories, or executable artifacts
were found. The unrelated untracked `.superpowers/` directory remains excluded from commits.

## Manual Acceptance

The user confirmed the Electron 44 build successfully completed all required gestures:

- STL and 3MF drag to Cura.
- STL and 3MF drag to Creality Print.
- External file drag to Explorer or Desktop.
- Internal model move to a library folder.

The upgraded Electron executable launched successfully after the existing antivirus exclusion and
remained available for the acceptance run.

## Deferred Work

- Upgrade Vitest 2 to Vitest 5 in an isolated tooling task.
- Repeat this checklist after installer packaging and code signing are introduced.
