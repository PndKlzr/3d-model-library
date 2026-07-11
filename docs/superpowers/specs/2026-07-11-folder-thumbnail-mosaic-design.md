# Folder Thumbnail Mosaic Design

## Goal

Make folder cards preview their contents like Windows Explorer while preserving the library's responsive lazy-loading behavior.

## Behavior

- Each grid folder card displays up to four real model thumbnails in a compact mosaic.
- Models stored directly in the folder are chosen before models from descendant folders.
- Only printable model formats with visual previews, STL and 3MF, are candidates.
- Selection is deterministic and capped at four models.
- One image fills the preview, two split it vertically, and three or four use a two-by-two mosaic.
- If no candidate produces a thumbnail, the existing folder icon remains visible.
- List view remains compact and continues to use the regular folder icon.

## Architecture

`getGridFolderCards` will attach a small preview-model list to each folder-card descriptor. A focused `FolderCardThumbnail` component will observe the folder card and request its images only when it approaches the viewport. It will reuse the existing thumbnail loader, rendered-thumbnail queue, and cache instead of creating a second rendering path.

The component will reveal the mosaic only after at least one image succeeds. Failed individual previews are omitted, and a complete failure falls back to the normal folder treatment. Thumbnail images are non-draggable so they cannot interfere with folder clicks or internal file dragging.

## Performance And Safety

- A folder requests at most four thumbnails.
- Intersection Observer prevents off-screen folder cards from starting work.
- Existing global thumbnail caching avoids rendering the same model twice for its model card and folder preview.
- Existing queue limits expensive 3D rendering concurrency.
- No directory scan, model parsing, or rendering occurs synchronously during React render.

## Testing

- Unit tests verify direct-folder priority, descendant fallback, deterministic ordering, printable-format filtering, and the four-item cap.
- Component contract tests verify lazy observation, shared thumbnail loading, non-draggable images, and folder fallback.
- The full unit suite and production build must pass.

