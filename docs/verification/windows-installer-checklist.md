# Windows Installer Acceptance Checklist

Use a disposable model library and record only pass/fail results. Do not add personal paths, model names, screenshots of private files, or antivirus logs containing personal information to this document.

## Artifacts

- [ ] `3D-Model-Library-Setup.exe` exists for Windows x64.
- [ ] The portable ZIP exists for Windows x64.
- [ ] `npm run verify:package` passes.
- [ ] Setup, portable ZIP, and packaged executable pass a Windows Defender scan.
- [ ] Any expected unknown-publisher warning is recorded without bypassing Windows security.

## Clean install

- [ ] Setup completes without administrator access, Node.js, or Git.
- [ ] One 3D Model Library entry appears in installed applications and the Start menu.
- [ ] The app launches and selects a disposable library whose path contains spaces, accents, and `+`.
- [ ] A tag, note, favorite, filter preference, slicer preference, and thumbnails can be created.

## Upgrade

- [ ] Installing the newer beta upgrades the same application entry.
- [ ] Tags, notes, favorites, filters, slicer settings, and thumbnails remain available.
- [ ] The library's `.3d-model-library` data remains unchanged and readable.

## Critical Flows

- [ ] A Disconnected library opens the recovery view instead of crashing.
- [ ] STL, 3MF, and OBJ thumbnails and interactive previews load.
- [ ] Folder monitoring notices a newly added file.
- [ ] ZIP, RAR, and 7Z inspection and extraction work with the configured extractor.
- [ ] 3MF-to-STL conversion completes and writes the selected output.
- [ ] Cura and Creality Print are detected or can be configured manually.
- [ ] External drag imports STL and 3MF files into Cura and Creality Print.
- [ ] External drag works for filenames containing spaces, accents, and `+`.
- [ ] The portable ZIP launches after being fully extracted and reads the same library safely.

## Uninstall

- [ ] Uninstall removes application binaries and shortcuts.
- [ ] The selected model library and every model file remain present.
- [ ] The `.3d-model-library` directory, tags, notes, and favorites remain present.
- [ ] Reinstalling and reconnecting the library restores its organization data.

## Release Gate

Do not publish the installer when a critical flow fails, the package audit reports private content, Windows Defender quarantines an artifact, or install/upgrade/uninstall changes library files unexpectedly. Automatic updates remain disabled for this unsigned beta.
