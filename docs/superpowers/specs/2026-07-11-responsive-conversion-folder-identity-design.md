# Responsive Conversion And Folder Identity Design

## Goal

Keep the interface responsive during 3MF-to-STL conversion and make folder cards immediately distinguishable from model cards.

## Conversion

- Run 3MF parsing and STL export in a Vite module Web Worker.
- Transfer the source `ArrayBuffer` to the worker instead of cloning it.
- Report stage progress before parsing, before export, and on completion.
- Show a determinate progress bar and percentage in the details panel.
- Disable only the conversion button while conversion is active.
- Preserve current save location, messages, library refresh, and error handling.
- Terminate the worker after success or failure.

## Folder Identity

- Preserve the thumbnail mosaic.
- Replace the small icon-only overlay with a persistent `PASTA` strip containing a folder icon.
- Use a solid accent border for folder cards while model cards retain their existing neutral border.
- Apply equivalent contrast in light and dark themes.

## Verification

- Unit-test conversion progress stages.
- Contract-test worker creation, transferable buffers, termination, and progress UI semantics.
- Preserve all existing tests and production build.

