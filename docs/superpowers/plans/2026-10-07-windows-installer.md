# Windows Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a safe Windows x64 `Setup.exe` and portable ZIP that run 3D Model Library without development tools and preserve all library data.

**Architecture:** Electron Forge will package the existing production build into an ASAR and use Squirrel.Windows plus the ZIP maker for distribution. Squirrel startup handling remains isolated from normal application startup, while a package-audit script verifies that release artifacts contain only runtime files. Automatic updates and code signing remain out of scope for this unsigned beta.

**Tech Stack:** Electron 44, Electron Forge, Squirrel.Windows, TypeScript, Node.js 22.12, Vitest, Windows x64

**Spec:** `docs/superpowers/specs/2026-10-07-windows-installer-design.md`

## Global Constraints

- Target Windows 10 or later on x64.
- Produce `3D-Model-Library-Setup.exe` and a Windows x64 portable ZIP.
- Installation must not require Node.js, Git, or administrator privileges.
- Do not add automatic updates or code signing in this phase.
- Never delete a selected library, model file, or `.3d-model-library` metadata during install, upgrade, or uninstall.
- Preserve the current application identity across future versions.
- Keep the existing Electron security settings and filesystem validation unchanged.
- Do not publish an artifact until local acceptance testing passes.

## Review Focus

- A library path containing spaces, accents, and `+` characters must still preview models and support external drag after installation; Task 5 tests this from the installed build.
- An unavailable saved library must open the disconnected-library experience instead of crashing; Task 5 tests an installed launch with the library temporarily disconnected.
- Upgrade and uninstall must preserve `%APPDATA%` preferences and all library-side metadata; Tasks 3 and 5 audit paths and verify this behavior.
- Release artifacts must not contain personal paths, `.env` files, model libraries, tests, Git data, or source maps; Task 3 enforces this with an artifact audit.
- Antivirus or an unknown-publisher warning must never be bypassed by weakening Electron or Windows security; Tasks 4 and 5 document and verify the unsigned-beta behavior.

---

### Task 1: Reproducible Forge Packaging

**Files:**
- Create: `forge.config.cjs`
- Create: `assets/app-icon.ico`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Test: `tests/unit/packagingConfig.test.ts`

**Interfaces:**
- Consumes: Existing `npm run build` output in `dist-electron` and `dist-renderer`.
- Produces: `npm run package:windows`, Forge configuration, stable product identity `3D Model Library`, executable name `3D Model Library.exe`, installer name `3D-Model-Library-Setup.exe`, and portable ZIP output under `out/`.

- [ ] **Step 1: Write the failing packaging contract test**

Add assertions that `package.json` contains the stable product metadata and Windows packaging scripts; `forge.config.cjs` enables ASAR, integrity fuses, dependency pruning, Squirrel and ZIP makers, the committed ICO, and development-directory exclusions. Assert `.gitignore` contains `out/` and the icon begins with a valid ICO header.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/unit/packagingConfig.test.ts`

Expected: FAIL because the Forge configuration and packaging scripts do not exist.

- [ ] **Step 3: Install the Forge packaging dependencies**

Run: `npm install --save-dev @electron-forge/cli @electron-forge/maker-squirrel @electron-forge/maker-zip @electron-forge/plugin-fuses @electron/fuses`

Expected: `package.json` and `package-lock.json` contain the direct development dependencies without changing Electron's major version.

- [ ] **Step 4: Add stable product metadata and package scripts**

Set `productName`, `description`, `author`, `license`, and Windows-oriented `package:windows` and `make:windows` scripts. Both scripts must run the existing production build before Forge; `make:windows` must target `win32` and `x64` explicitly.

- [ ] **Step 5: Create the Forge configuration and beta icon**

Configure `packagerConfig.asar: true`, dependency pruning, the stable executable name, the ICO path, Squirrel `setupExe: "3D-Model-Library-Setup.exe"`, and the ZIP maker. Add Forge's Fuses plugin with embedded ASAR integrity validation and loading exclusively from ASAR enabled; disable RunAsNode, `NODE_OPTIONS`, and packaged CLI inspection. Use a restrained beta icon based on the existing `3D` application badge, and exclude `.git`, `.github`, docs, tests, root source, development scripts, tools, logs, environment files, local metadata, benchmark output, and generated build output not needed at runtime.

- [ ] **Step 6: Run the focused test and production build**

Run: `npm test -- tests/unit/packagingConfig.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: TypeScript and Vite builds complete successfully.

- [ ] **Step 7: Commit the packaging configuration**

```powershell
git add forge.config.cjs assets/app-icon.ico package.json package-lock.json .gitignore tests/unit/packagingConfig.test.ts
git commit -m "build: configure Windows installer packaging"
```

### Task 2: Squirrel Startup Lifecycle

**Files:**
- Create: `electron/services/squirrelStartup.ts`
- Modify: `electron/main.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/unit/squirrelStartup.test.ts`
- Test: `tests/unit/productFlowContract.test.ts`

**Interfaces:**
- Consumes: The boolean startup result exported by `electron-squirrel-startup`.
- Produces: `shouldStartNormalApplication(isSquirrelStartup: boolean): boolean`; normal application initialization runs only when it returns `true`.

- [ ] **Step 1: Write failing unit and main-process contract tests**

Test that `shouldStartNormalApplication(true)` returns `false`, `shouldStartNormalApplication(false)` returns `true`, and `electron/main.ts` evaluates the Squirrel event before registering normal startup. The existing window security assertions must remain unchanged.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/unit/squirrelStartup.test.ts tests/unit/productFlowContract.test.ts`

Expected: FAIL because the lifecycle helper and startup guard do not exist.

- [ ] **Step 3: Add the Squirrel runtime dependency**

Run: `npm install electron-squirrel-startup`

If its package does not provide TypeScript declarations, also run `npm install --save-dev @types/electron-squirrel-startup`.

- [ ] **Step 4: Implement the startup guard**

Create the pure helper with the exact signature above. Import the Squirrel result and helper near the top of `electron/main.ts`, move the existing `app.whenReady()` startup chain behind the guard, and leave benchmark startup behavior, window security, library activation, and shutdown cleanup unchanged.

- [ ] **Step 5: Run lifecycle tests and the complete test suite**

Run: `npm test -- tests/unit/squirrelStartup.test.ts tests/unit/productFlowContract.test.ts`

Expected: PASS.

Run: `npm test`

Expected: All tests pass with no regression in development startup.

- [ ] **Step 6: Commit the lifecycle integration**

```powershell
git add electron/services/squirrelStartup.ts electron/main.ts package.json package-lock.json tests/unit/squirrelStartup.test.ts tests/unit/productFlowContract.test.ts
git commit -m "feat: handle Windows installer lifecycle"
```

### Task 3: Release Artifact Privacy Audit

**Files:**
- Create: `scripts/verify-package.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/unit/packageAudit.test.ts`

**Interfaces:**
- Consumes: Forge's generated `resources/app.asar` under `out/`.
- Produces: `findForbiddenPackagedPaths(paths: readonly string[]): string[]`, `containsPersonalPath(content: string, profileRoot: string): boolean`, and CLI command `npm run verify:package` that exits nonzero when forbidden content is present.

- [ ] **Step 1: Write the failing package-audit tests**

Test accepted runtime entries, including compiled `dist-electron/src` modules, and rejection of root `.git`, `.github`, `docs`, `tests`, `src`, development scripts, tools, `.env*`, `*.log`, `*.map`, `.3d-model-library`, benchmark results, STL, 3MF, OBJ, and archives. Test textual detection of a Windows user-profile path without exposing that path in the returned diagnostic.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/unit/packageAudit.test.ts`

Expected: FAIL because the audit module does not exist.

- [ ] **Step 3: Add an explicit ASAR inspection dependency**

Run: `npm install --save-dev @electron/asar`

Expected: The audit script does not rely on an undeclared transitive dependency.

- [ ] **Step 4: Implement the package audit**

Export the pure path and text classifiers and implement a CLI that locates exactly one packaged `app.asar`, lists its entries with `@electron/asar`, and scans JavaScript, JSON, HTML, and CSS runtime text for the current profile root. Report only relative forbidden entries and exit with status `1` on leakage; never print file contents or personal absolute paths.

- [ ] **Step 5: Add the verification script and run its unit tests**

Add `verify:package` to `package.json`.

Run: `npm test -- tests/unit/packageAudit.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the artifact audit**

```powershell
git add scripts/verify-package.mjs package.json package-lock.json tests/unit/packageAudit.test.ts
git commit -m "build: audit packaged application contents"
```

### Task 4: Installer Documentation And Acceptance Checklist

**Files:**
- Create: `docs/verification/windows-installer-checklist.md`
- Modify: `README.md`
- Modify: `README.pt-BR.md`
- Modify: `SECURITY.md`
- Test: `tests/unit/installerDocumentation.test.ts`

**Interfaces:**
- Consumes: `3D-Model-Library-Setup.exe`, portable ZIP, and `npm run verify:package` from earlier tasks.
- Produces: Parallel English and Brazilian Portuguese installation instructions plus a repeatable clean-install, upgrade, uninstall, and antivirus checklist.

- [ ] **Step 1: Write the failing documentation contract test**

Assert both READMEs describe Setup and portable installation, the unknown-publisher warning, preserved library data, and source-development fallback. Assert `SECURITY.md` does not claim the unsigned beta is signed, and the checklist covers install, upgrade, uninstall, disconnected library, external drag, slicer discovery, archive extraction, conversion, thumbnails, and antivirus scanning.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/unit/installerDocumentation.test.ts`

Expected: FAIL because the installer documentation and checklist are absent.

- [ ] **Step 3: Write the bilingual installation documentation**

Make the installer the primary user path while retaining the existing source instructions for contributors. Explain that the unsigned beta can trigger Windows warnings, without instructing users to disable Defender or add broad exclusions.

- [ ] **Step 4: Add the acceptance checklist and security note**

Document exact artifact names, expected install location behavior, data paths that must survive, test-library setup, upgrade procedure, uninstall verification, artifact scanning, and a release gate that forbids publication when any critical flow fails.

- [ ] **Step 5: Run documentation tests**

Run: `npm test -- tests/unit/installerDocumentation.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the documentation**

```powershell
git add README.md README.pt-BR.md SECURITY.md docs/verification/windows-installer-checklist.md tests/unit/installerDocumentation.test.ts
git commit -m "docs: add Windows installer guidance"
```

### Task 5: Build And Validate The Installer Candidate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Update: `docs/verification/windows-installer-checklist.md`

**Interfaces:**
- Consumes: All packaging, lifecycle, audit, and documentation work from Tasks 1-4.
- Produces: Locally validated `v0.1.0-beta.2` setup and portable artifacts ready for the user's final publication decision.

- [ ] **Step 1: Establish the complete automated baseline**

Run: `npm ci`

Run: `npm test`

Run: `npm run build`

Run: `npm audit`

Expected: dependency installation, all tests, build, and audit succeed before packaging.

- [ ] **Step 2: Build the baseline beta installer**

Keep version `0.1.0-beta.1`, run `npm run make:windows`, then run `npm run verify:package`.

Expected: Squirrel Setup and ZIP artifacts exist under `out/`, and the artifact audit reports no forbidden content.

- [ ] **Step 3: Perform a clean baseline installation**

Install the baseline build without administrator elevation. Select a disposable test library whose path contains spaces, accents, and `+`; create a tag, note, favorite, custom filter state, custom slicer path, and generated thumbnails. Record only pass/fail results in the checklist.

- [ ] **Step 4: Prepare the installer release candidate**

Run: `npm version 0.1.0-beta.2 --no-git-tag-version`

Update `CHANGELOG.md` to identify the Windows installer as an unsigned beta and state that automatic updates are not included.

- [ ] **Step 5: Build and install the upgrade candidate**

Run: `npm run make:windows`

Run: `npm run verify:package`

Install `v0.1.0-beta.2` over the baseline. Confirm the same application entry is upgraded and the disposable library's tags, notes, favorite, preferences, slicer configuration, and metadata remain intact.

- [ ] **Step 6: Exercise installed and portable critical flows**

Using the checklist, verify startup with a disconnected library; STL, 3MF, and OBJ previews; thumbnail workers; folder monitoring; ZIP/RAR/7Z extraction; 3MF-to-STL conversion; slicer detection; custom slicer launching; and external drag of STL/3MF files with spaces, accents, and `+` into Cura and Creality Print. Repeat startup and preview checks from the portable ZIP.

- [ ] **Step 7: Verify uninstall safety**

Uninstall the application and confirm the disposable library, `.3d-model-library` directory, model files, tags, notes, and favorites remain. Reinstall and reconnect the library to confirm the metadata is read again.

- [ ] **Step 8: Scan artifacts and record the release decision**

Scan Setup, ZIP, and packaged executable with Windows Defender. Record scan results and any unknown-publisher warning in the local checklist without adding machine-specific paths or model names. Do not weaken Windows security or publish when the application is quarantined or a critical flow fails.

- [ ] **Step 9: Run final verification and commit the release candidate**

Run: `npm test`

Run: `npm run build`

Run: `npm audit`

Run: `npm run verify:package`

Expected: all commands pass and the acceptance checklist has no unresolved critical failure.

```powershell
git add package.json package-lock.json CHANGELOG.md docs/verification/windows-installer-checklist.md
git commit -m "chore: prepare Windows installer beta"
```

Do not create a Git tag or upload release artifacts until the user reviews the locally validated installer.

