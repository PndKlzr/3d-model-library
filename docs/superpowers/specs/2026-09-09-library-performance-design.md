# Library Performance and Final Polish Design

## Goal

Make a library with hundreds of models feel immediate without changing the file organization, native drag behavior, slicer integration, or explicit 3D preview flow.

The application should show useful content from the previous session as soon as it opens, update that content in the background, and spend thumbnail work only on items the user can currently see.

Packaging is explicitly out of scope for this pass.

## Current Problems

- The recursive scan runs before the library becomes useful and stats every supported file on every refresh.
- Rendered thumbnails exist only in renderer memory, so STL and generated 3MF thumbnails are rebuilt after every application restart.
- A thumbnail request remains queued after its card leaves the viewport.
- Folder mosaics can enqueue up to four jobs each and compete with visible model cards.
- Every generated thumbnail creates and disposes a WebGL renderer, which adds GPU and main-thread overhead.
- Loading feedback does not clearly distinguish cached content from background reconciliation.

## Architecture

### Persistent Library Index

Add a versioned library index store in the Electron process. Each configured library has one cached snapshot containing the root path, folders, model names, extensions, sizes, and modification times.

On startup:

1. Load and display the cached snapshot immediately when it belongs to the configured library.
2. Start a real filesystem scan in the background.
3. Atomically replace the displayed snapshot only when reconciliation finishes.
4. Persist the fresh result after a successful scan.

An invalid, unreadable, or schema-incompatible cache is ignored. It must never prevent a real scan. File operations such as move, rename, create, trash, restore, and extraction continue to trigger reconciliation, so the filesystem remains the source of truth.

### Faster Reconciliation

Keep directory traversal deterministic, but collect file-stat work through a small bounded concurrency pool rather than awaiting every file sequentially. The concurrency limit will be conservative to avoid saturating slower disks.

Scanning still reads directory entries and file metadata only. It must not parse STL geometry, unzip 3MF files, hash models, or generate thumbnails.

### Persistent Thumbnail Cache

Store generated thumbnail files under Electron's application data directory, never inside the user's model library. Cache identity is derived from a versioned renderer signature plus the canonical model path, size, and modification time.

The cache supports:

- embedded 3MF images;
- rendered STL thumbnails;
- rendered 3MF thumbnails when no suitable embedded image exists.

Reads validate that the cache entry is a regular image file. Writes use a temporary file followed by rename so an interrupted render cannot leave a partially valid thumbnail. Cache failures fall back to normal rendering and never block opening a model.

Old entries are pruned by age and total size with a conservative budget. Pruning runs after startup work becomes idle, not during first paint.

### Viewport-Priority Queue

Replace the append-only thumbnail queue with a shared request scheduler.

- Visible model cards receive high priority.
- Near-viewport cards receive normal priority.
- Folder mosaic images receive low priority.
- Cards cancel their subscription when leaving the viewport or unmounting.
- A queued job with no remaining subscribers is removed before file reading or parsing begins.
- Identical model signatures share one job and one result.
- The queue runs one heavy geometry parse/render at a time initially; cached image reads may run concurrently.

The queue will expose status counters so the UI can show background activity without rendering a spinner in every card.

### Reused Thumbnail Renderer

Use one reusable thumbnail renderer rather than creating a WebGL context for every model. Each job replaces the scene object, resets camera and lights, renders once, and disposes model-specific geometry and materials while retaining the renderer itself.

If the renderer encounters a lost context or render error, it is recreated for the next job. This preserves the existing high-performance GPU preference while reducing maximization and scrolling stalls.

Worker-based geometry parsing is deliberately deferred unless measurements after the cache and scheduler changes still show meaningful main-thread stalls. That keeps this pass focused and avoids duplicating the tolerant 3MF parsing logic prematurely.

## User Experience

- Cached cards appear immediately with no blocking startup screen.
- A compact status near Refresh reports `Atualizando biblioteca...` during reconciliation and disappears when current.
- Placeholder dimensions remain fixed so thumbnails do not shift the grid.
- Failed thumbnails retain the existing file-type placeholder; one failure does not retry continuously in the same session.
- Manual Refresh forces reconciliation but reuses valid thumbnails.
- Explicit 3D preview in the details panel keeps priority over background thumbnail generation.
- Search, folder navigation, selection, internal drag, native external drag, conversion, tags, notes, and archive workflows remain behaviorally unchanged.

## Error Handling and Safety

- The filesystem remains authoritative; cached entries never authorize a file operation.
- Every operation that reads or writes a model continues to validate the path against the configured library.
- Cache paths are generated internally and cannot be supplied by renderer input.
- Corrupt index or thumbnail files are ignored and replaced lazily.
- A failed background scan keeps the cached view visible and reports the scan error without erasing the library.
- No model file is modified by indexing or thumbnail caching.

## Testing

Add focused tests for:

- index schema validation, library isolation, atomic replacement, and corrupt-cache fallback;
- bounded scan concurrency and the existing no-geometry-during-scan contract;
- thumbnail cache key invalidation after size or modification changes;
- cache write/read failure fallback and pruning limits;
- scheduler priority, deduplication, cancellation, and failed-job behavior;
- persistent renderer reuse and disposal boundaries;
- immediate cached display followed by background reconciliation;
- unchanged native/internal drag and file-operation contracts.

Run the complete unit suite and production build. Measure cold and warm startup against a real library snapshot, recording time to cached grid, scan completion, first visible thumbnail, and event-loop stalls. Acceptance requires warm startup to show the cached grid before reconciliation completes and scrolling to stop enqueueing work for cards that have left the viewport.

## Delivery Order

1. Instrument baseline timings without changing behavior.
2. Add the persistent library index and background reconciliation.
3. Add the persistent thumbnail cache.
4. Replace the queue with viewport priorities and cancellation.
5. Reuse the WebGL thumbnail renderer.
6. Polish loading/error feedback and verify responsive behavior.
7. Re-run regression tests and compare measurements.

## Deferred Work

- Installer or packaged executable.
- Electron major-version upgrade.
- Full grid virtualization unless DOM measurements show it is still necessary.
- Worker-based geometry parsing unless the measured main-thread budget remains unacceptable.
- New organizational features unrelated to performance.
