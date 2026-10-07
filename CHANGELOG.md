# Changelog

All notable changes to 3D Model Library will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-beta.1] - 2026-10-07

### Added

- Visual grid and list browsing for STL, 3MF, OBJ, images, and common archive formats.
- Generated 3D thumbnails, folder mosaics, and an interactive model preview.
- Folder navigation, file organization, favorites, notes, reusable tags, and combined filters.
- Portable per-library metadata with backup, restore, health checks, and external rename recovery.
- Native drag and drop to Windows Explorer, Cura, Creality Print, and compatible desktop apps.
- Automatic discovery of popular FDM slicers and support for custom slicer executables.
- ZIP, RAR, and 7Z inspection and extraction workflows.
- Non-blocking 3MF-to-STL conversion.
- Brazilian Portuguese and English interfaces, light and dark themes, and responsive layouts.

### Reliability And Security

- Added session-scoped library operations and path validation around filesystem access.
- Added thumbnail caching, staged background generation, diagnostics, and recovery actions.
- Added graceful recovery when a saved library is on a disconnected drive.
- Added automated Windows tests, production builds, dependency audits, and protected `main` checks.
- Added secret scanning, Dependabot alerts, private vulnerability reporting, and security documentation.

### Known Limitations

- This beta is distributed as source code and does not yet include a signed Windows installer.
- RAR and 7Z support requires 7-Zip or another compatible extractor.
- OBJ previews display geometry only; materials, external textures, points, and lines are ignored.
- The application is Windows-focused and has not been validated for production use on macOS or Linux.

[Unreleased]: https://github.com/PndKlzr/3d-model-library/compare/v0.1.0-beta.1...HEAD
[0.1.0-beta.1]: https://github.com/PndKlzr/3d-model-library/releases/tag/v0.1.0-beta.1
