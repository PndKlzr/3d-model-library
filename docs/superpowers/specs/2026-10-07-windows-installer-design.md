# Windows Installer Design

## Goal

Distribute 3D Model Library as a normal Windows application that people can install and open without installing Node.js, Git, or development tools. The installer must preserve model files and library metadata during upgrades and uninstallation.

## Scope

The first packaged release targets 64-bit Windows and produces two artifacts:

- A user-friendly `Setup.exe` installer.
- A portable ZIP as a fallback for users who cannot or do not want to install the app.

This phase does not add automatic updates or purchase a code-signing certificate. The beta installer may therefore display a Windows "unknown publisher" warning.

## Packaging Approach

Use Electron Forge with the Squirrel.Windows maker. This is the packaging path recommended by the Electron project and provides a per-user installer that does not require administrator privileges.

The build pipeline will:

1. Compile the Electron main process, preload script, and renderer with the existing production build.
2. Package only the runtime application files and production dependencies.
3. Store application source and resources in an ASAR archive where compatible.
4. Generate the Squirrel.Windows installer artifacts and a portable ZIP for Windows x64.

Package metadata will define a stable application name, executable name, application ID, description, author, and icon. Development scripts, tests, documentation, local caches, screenshots, and user libraries will not be included in the application package.

## Installation Lifecycle

The Electron main process will handle Squirrel startup events before creating the main window. Install, update, uninstall, and obsolete-version events will finish quickly and quit without starting the normal application flow.

The installer will create normal Windows application registration and Start menu integration. A desktop shortcut may be offered by the installer, but the existing development shortcut is not part of the packaged application and must not be modified automatically.

Only one installed application identity will be used across future versions so installing a newer version upgrades the existing installation instead of creating a second app.

## Data Safety

Packaging must not change the existing ownership boundaries:

- STL, 3MF, OBJ, archives, images, and `.3d-model-library` metadata remain in the selected library folder.
- Application preferences and compatibility data remain in the application's Windows user-data folder.
- Installer upgrades replace application binaries only.
- Uninstallation removes installed application binaries and shortcuts, but never deletes a selected library or its metadata.

The application will continue to tolerate a missing or disconnected library at startup. Reinstalling the app must allow the existing library metadata to be read again after that library is selected.

## Security And Trust

The packaged app will keep the existing Electron security settings and filesystem validation. The package will exclude secrets, personal paths, development output, Git data, and unnecessary executables.

ASAR integrity support will be enabled if it is compatible with the selected Forge packaging path and the existing native file-drag behavior. External file drag, archive extraction, slicer launching, thumbnail workers, and other features that need filesystem paths must be tested from the installed build rather than assumed to work from the development build.

The initial beta may remain unsigned. Documentation and release notes will clearly state that Windows can show an unknown-publisher warning. Code signing and automatic updates remain separate follow-up work because reliable automatic updates require a stable signed publishing flow.

## User Experience

An installed user should be able to:

1. Download one setup file from the GitHub release.
2. Install without administrator access or development dependencies.
3. Launch 3D Model Library from the Start menu or desktop shortcut.
4. Select a library on first launch, or reconnect an existing library.
5. Install a newer beta without losing preferences, notes, tags, favorites, or model files.
6. Uninstall without deleting any library content.

The portable ZIP will launch the same application without installation. It is a fallback distribution format, not a separate feature set.

## Failure Handling

- A packaging failure must leave the source checkout and development runtime untouched.
- Missing optional assets such as an icon must fail validation before a release artifact is published.
- If an installed launch cannot find the saved library, the existing disconnected-library experience is shown.
- Packaging diagnostics must not include library file contents or personal absolute paths in published artifacts.
- An unsigned build that is quarantined by antivirus will be documented as a trust limitation, not worked around by weakening security settings.

## Verification

Before publishing an installer, verify:

- Existing unit tests and production build pass.
- The package contains no repository secrets, personal library data, development caches, or source maps not intended for distribution.
- Clean installation works on Windows x64 without Node.js or Git.
- First launch and library selection work.
- Existing tags, notes, favorites, filters, and preferences survive an upgrade.
- Uninstallation leaves the library and `.3d-model-library` metadata intact.
- STL, 3MF, and OBJ previews work from the installed application.
- Dragging STL and 3MF files to Cura and Creality Print still works.
- Slicer detection, custom slicer paths, archive extraction, conversion, folder monitoring, and thumbnail workers work.
- The portable ZIP launches and reads the same library safely.
- Installer and portable artifacts are scanned before attaching them to a GitHub prerelease.

## Release Strategy

The first installer will be published as a prerelease only after local acceptance testing. Automatic updates remain disabled. Once the unsigned installer is stable, code signing can be added without changing the application's library-data format.

