# Security Policy

## Supported Version

3D Model Library is still in active development. Security fixes are applied to the latest commit on the active development branch. There is no signed installer or packaged release yet.

## Reporting a Vulnerability

Please do not open a public issue with exploit details, personal paths, model-library contents, or credentials.

Use GitHub's private vulnerability reporting or Security Advisory feature for this repository. Include:

- the affected commit or version;
- clear reproduction steps;
- the expected and observed behavior;
- the potential impact;
- logs with personal paths, filenames, tokens, and library contents removed.

## Security Boundaries

- The application is local-first and has no account, cloud-sync, or telemetry requirement.
- Filesystem operations are constrained to the active library and use canonical path checks.
- Destructive deletion goes through the Windows Recycle Bin.
- External drag and drop uses existing local files and does not delete the source.
- Portable library metadata stores relative paths and organization data, not model contents or credentials.
- Generated thumbnails and the rebuildable index are disposable caches.

## Dependency Policy

Runtime dependencies are checked separately from development tooling:

```powershell
npm audit --omit=dev
npm audit
```

A runtime audit must be clean before a packaged release. Development-only advisories are reviewed for exposure and upgraded deliberately when the required toolchain migration has been tested.

## Before Publishing

- Run tests and a production build.
- Review tracked and staged files for generated artifacts and personal data.
- Scan commit metadata and history for personal e-mail addresses and filesystem paths.
- Never publish `.env` files, tokens, private keys, slicer executables, user libraries, or local application data.
