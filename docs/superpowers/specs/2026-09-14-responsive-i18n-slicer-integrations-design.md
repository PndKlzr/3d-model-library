# Responsive UI, Languages, and Slicer Integrations

## Goal

Improve the existing desktop application without replacing its visual identity. The work has three independent deliverables: reliable responsive behavior, complete Portuguese and English support, and safe discovery plus manual configuration of FDM slicers on Windows.

The deliverables will be implemented and validated in that order so a failure in one area does not block or destabilize the others.

## 1. Responsive Desktop UI

### Window behavior

- Wide windows keep the current three-column workspace: folder tree, library, and details.
- Medium windows allow the folder tree to collapse and show the details panel as an overlay drawer.
- Narrow windows prioritize the library grid. Both side panels become drawers and never reduce the model area below a usable width.
- The application keeps a practical minimum window size, but every supported size must avoid clipped controls, overlapping text, and inaccessible actions.

### Header and library controls

- The sticky library header remains visible while scrolling.
- The title, status, search, filters, view controls, drag mode, refresh, and settings controls reflow into stable rows at defined breakpoints.
- `Sua biblioteca visual` and its English equivalent use fixed typography ranges instead of viewport-scaled text.
- Labels may wrap only where the component explicitly allows it. Icon controls keep stable square dimensions and tooltips.
- Low-priority labels collapse before primary controls disappear.

### Dialogs and popovers

- All dialogs use the shared `DialogShell` structure and a shared close button.
- The close control is a square icon button aligned to the top-right, with tooltip, accessible name, focus state, and a stable hit target.
- Tag selection, settings, confirmation, and text-entry dialogs remain inside the viewport and use internal scrolling when content is tall.
- Context menus and popovers reposition above or sideways when there is insufficient room.
- `Escape`, mouse back, backdrop click where appropriate, and the close button follow the same cancellation semantics.

### Verification

- Component and layout contract tests cover wide, medium, and narrow widths.
- Visual checks cover light and dark themes at representative desktop sizes.
- Long Portuguese and English labels are included in overflow tests.

## 2. Portuguese and English

### Locale model

- Supported locales are `pt-BR` and `en`.
- On the first run, the application suggests the Windows locale and falls back to Portuguese when it cannot identify a supported locale.
- The selected locale is persisted in application settings and can be changed manually without restarting.
- A future installer will preselect the Windows language, allow Portuguese or English selection, and pass that initial choice to the application.

### Translation boundary

- All user-facing interface copy is resolved through one typed translation service: React labels, dialogs, tooltips, empty states, progress, operation feedback, Electron dialogs, and actionable errors.
- Translation keys describe meaning rather than copying the Portuguese sentence.
- Counts use locale-aware plural forms and dates use the selected locale.
- User data is never translated: filenames, folder names, notes, tags, custom slicer names, and paths remain unchanged.
- Diagnostic identifiers and internal logs remain stable and language-neutral.

### Migration and fallback

- Existing settings without a locale receive the detected Windows locale on first load after migration.
- Missing English entries fall back to Portuguese in development and are reported by tests.
- Both locale catalogs must contain the same keys before the build passes.

## 3. Windows FDM Slicer Discovery

### Built-in catalog

The initial detector recognizes:

- UltiMaker Cura
- Creality Print
- OrcaSlicer
- PrusaSlicer
- Bambu Studio
- Anycubic Slicer Next
- ideaMaker
- ELEGOO SatelLite

Resin-focused slicers are intentionally out of scope for this phase.

### Discovery strategy

- Discovery is read-only and bounded. It checks Windows uninstall registry entries, App Paths, Start Menu shortcuts, relevant file associations, and known installation directories.
- It does not recursively scan drives and never launches a candidate executable.
- Every candidate must resolve to an existing regular `.exe` file.
- Results are deduplicated by canonical executable path. When multiple versions exist, the UI displays the selected path and allows the user to change it.
- Detection runs during initial settings setup and on an explicit `Detectar novamente` action, not continuously in the background.

### Configuration model

- Detected slicers appear as active integrations with status `Encontrado`, but none becomes the default automatically.
- The user explicitly chooses the default slicer used by double-click.
- Built-in integrations can be enabled, disabled, rescanned, or assigned a corrected executable path. They are not permanently deleted.
- `Adicionar programa` creates a custom integration with a user-provided name and selected `.exe`.
- Custom integrations can be renamed, enabled, disabled, assigned another executable, or removed.
- Custom IDs are generated independently from names so renaming does not break history or the default selection.
- If a configured executable disappears, the integration is retained, shown as unavailable, and excluded from launch actions until repaired.

### Security and launch behavior

- Renderer input is validated again in the Electron main process.
- Only canonical paths to existing `.exe` files may be saved or launched.
- Detection never changes the default slicer and never executes discovered files.
- Existing launch restrictions remain: only supported printable formats are sent to slicers.
- Settings migration preserves the current Cura and Creality Print configuration and default selection.

## Delivery Order

1. Responsive foundations and shared dialog controls.
2. Typed internationalization and complete Portuguese/English catalogs.
3. Slicer settings model migration and discovery service.
4. Integration UI for detection, default selection, and custom programs.
5. Full regression, responsive visual verification, and Windows discovery tests.

Each delivery receives its own focused tests and commit. Packaging and installer creation remain out of scope; only the contract for future installer locale selection is defined here.

## Acceptance Criteria

- No text or controls overlap at supported window sizes in either language.
- The tag dialog has a consistent, reachable close control and remains inside the viewport.
- Side panels become usable drawers when the window cannot support three columns.
- Portuguese and English cover all user-visible application and Electron messages.
- The first run follows the Windows language and manual selection overrides it persistently.
- Installed supported slicers are detected without launching them or scanning entire drives.
- No detected slicer becomes default without explicit user action.
- A custom slicer can be added, renamed, repaired, disabled, removed, and selected as default.
- Existing settings, metadata, tags, notes, and slicer history survive migration.
