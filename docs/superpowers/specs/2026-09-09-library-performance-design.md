# Library Performance and Final Polish Design

## Goal

Make a library with hundreds of models feel immediate without changing the file organization, native drag behavior, slicer integration, or explicit 3D preview flow.

The application should show useful content from the previous session as soon as it opens, update that content in the background, and prioritize thumbnail work for items the user can currently see while retaining completed work for later visits.

Packaging is explicitly out of scope for this pass.

## Current Problems

- The recursive scan runs before the library becomes useful and stats every supported file on every refresh.
- Rendered thumbnails exist only in renderer memory, so STL and generated 3MF thumbnails are rebuilt after every application restart.
- A thumbnail request remains queued after its card leaves the viewport.
- Folder mosaics can enqueue up to four jobs each and compete with visible model cards.
- Every generated thumbnail creates and disposes a WebGL renderer, which adds GPU and main-thread overhead.
- Loading feedback does not clearly distinguish cached content from background reconciliation.
- External filesystem changes require a manual full refresh.
- Search does not include notes or usage-oriented filters such as recently opened models.

## Architecture

### Persistent Library Index

Add a versioned library index store in the Electron process. Each configured library has one cached snapshot containing the root path, folders, model names, extensions, sizes, and modification times.

On startup:

1. Load and display the cached snapshot immediately when it belongs to the configured library.
2. Start a real filesystem scan in the background.
3. Atomically replace the displayed snapshot only when reconciliation finishes.
4. Persist the fresh result after a successful scan.

This is a two-phase load. Phase one restores the persisted index and makes navigation, search, and selection usable. Phase two reconciles the index against the filesystem and publishes additions, removals, renames, and changed signatures without clearing the visible grid.

An invalid, unreadable, or schema-incompatible cache is ignored. It must never prevent a real scan. File operations such as move, rename, create, trash, restore, and extraction continue to trigger reconciliation, so the filesystem remains the source of truth.

### Faster Reconciliation

Keep directory traversal deterministic, but collect file-stat work through a small bounded concurrency pool rather than awaiting every file sequentially. The concurrency limit will be conservative to avoid saturating slower disks.

Scanning still reads directory entries and file metadata only. It must not parse STL geometry, unzip 3MF files, hash models, or generate thumbnails.

### Optional Folder Monitoring

Add a remembered `Monitorar alteracoes automaticamente` setting. It is enabled by default for a local library and can be disabled without affecting manual Refresh.

The watcher reports additions, changes, removals, and renames after the initial reconciliation. A short debounce window combines bursts such as archive extraction or multi-file copies. Events update only affected index entries; they do not trigger a full recursive scan. Operations initiated by the application are correlated with watcher events so move, rename, trash, restore, conversion, and extraction are not processed twice.

If the watcher cannot start, loses the directory, or exceeds an operating-system limit, the application keeps the current index, disables monitoring for that session, and shows a concise message directing the user to manual Refresh. Turning the setting off closes the watcher immediately.

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
- A card that leaves the viewport lowers the priority of work that has not started.
- A thumbnail generation job that has already started is allowed to finish and is persisted, even if its card leaves the viewport.
- Work for the current viewport can overtake older low-priority work, so fast scrolling never waits behind the complete browsing history.
- Identical model signatures share one job and one result.
- The queue runs one heavy geometry parse/render at a time initially; cached image reads may run concurrently.

The queue will expose status counters so the UI can show background activity without rendering a spinner in every card.

Metadata reconciliation and thumbnail generation use separate queues. Finishing or failing one queue never blocks the other, and the explicit details-panel preview can temporarily outrank background thumbnails.

### Grid Virtualization

Render only the visible grid/list window plus a small overscan region while preserving stable keyboard selection, shift ranges, drag behavior, folder drops, and scroll position. Virtualization controls DOM cost; the thumbnail scheduler independently controls file and GPU work.

The first implementation must preserve the current responsive card dimensions. If variable row measurement causes visible jumping, use deterministic row heights per view mode rather than continuously measuring every card.

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
- Automatic monitoring has an on/off control in Settings and visibly reports whether it is active.
- Explicit 3D preview in the details panel keeps priority over background thumbnail generation.
- Search, folder navigation, selection, internal drag, native external drag, conversion, tags, notes, and archive workflows remain behaviorally unchanged.

### Search and Usage Filters

Keep the existing name, size, modification-date, and type controls. Add:

- `Abertos recentemente`, backed by the existing slicer-open history;
- `Nunca abertos`;
- `Com notas` and `Sem notas` as mutually exclusive choices;
- note text to the general search index;
- tag matching modes for all selected tags, any selected tag, or excluding selected tags.

Filter combinations update the current grid in real time and never start geometry or thumbnail work. Recently opened means successfully launched through a configured slicer from this application; merely selecting or previewing a model does not count.

## Error Handling and Safety

- The filesystem remains authoritative; cached entries never authorize a file operation.
- Every operation that reads or writes a model continues to validate the path against the configured library.
- Cache paths are generated internally and cannot be supplied by renderer input.
- Corrupt index or thumbnail files are ignored and replaced lazily.
- A failed background scan keeps the cached view visible and reports the scan error without erasing the library.
- Watcher events are hints only and are validated against the filesystem before changing the index.
- No model file is modified by indexing or thumbnail caching.

## Testing

Add focused tests for:

- index schema validation, library isolation, atomic replacement, and corrupt-cache fallback;
- bounded scan concurrency and the existing no-geometry-during-scan contract;
- thumbnail cache key invalidation after size or modification changes;
- cache write/read failure fallback and pruning limits;
- scheduler priority, deduplication, demotion, started-job completion, and failed-job behavior;
- watcher debounce, event validation, duplicate suppression, disable behavior, and failure fallback;
- persistent renderer reuse and disposal boundaries;
- immediate cached display followed by background reconciliation;
- virtualized selection, drag/drop, scroll restoration, and responsive row behavior;
- recent/never-opened, notes, and tag-matching filter combinations;
- unchanged native/internal drag and file-operation contracts.

Run the complete unit suite and production build. Measure cold and warm startup against a real library snapshot, recording time to cached grid, scan completion, first visible thumbnail, and event-loop stalls. Acceptance requires warm startup to show the cached grid before reconciliation completes and scrolling to stop enqueueing work for cards that have left the viewport.

## Delivery Order

1. Instrument baseline timings without changing behavior.
2. Add the persistent library index and background reconciliation.
3. Add optional debounced folder monitoring.
4. Add the persistent thumbnail cache.
5. Replace the queue with viewport priorities and separate metadata/thumbnail work.
6. Add grid/list virtualization without changing drag or selection semantics.
7. Reuse the WebGL thumbnail renderer.
8. Add usage, notes, and tag-matching filters.
9. Polish loading/error feedback and verify responsive behavior.
10. Re-run regression tests and compare measurements.

## Deferred Work

- Installer or packaged executable.
- Electron major-version upgrade.
- Worker-based geometry parsing unless the measured main-thread budget remains unacceptable.
- Custom thumbnail selection and replacement.
- New organizational features unrelated to performance.
