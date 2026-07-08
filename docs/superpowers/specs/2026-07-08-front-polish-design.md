# Front Polish Design

## Goal

Polish the existing desktop UI without changing the core product shape: keep the three-panel Explorer-style workflow, but make it more resilient when the window is narrow, when lists have many columns/tags, and when overlays are open.

## Approved Scope

- Make the main shell fit the app's Electron minimum window width instead of clipping panels.
- Make list view degrade gracefully by hiding less important columns at narrower desktop widths.
- Keep tag filters from consuming too much vertical space in the grid.
- Make the tag selector close predictably on outside click and Escape, and keep the popover inside its local panel.
- Add a reusable dialog shell so confirmation, text input, settings, and tag dialogs share backdrop/focus behavior.
- Keep the current visual direction: technical, quiet, dense, teal-accented, not a marketing page.

## Out of Scope

- No new navigation model.
- No major visual rebrand.
- No packaging changes.
- No slicer or file-operation behavior changes.

## Testing

- Add/adjust contract tests for responsive layout tokens, list behavior, capped tag filter area, tag selector close behavior, and shared dialog shell usage.
- Run focused tests first, then the full unit suite and production build.
