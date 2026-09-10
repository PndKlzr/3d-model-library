# Thumbnail Performance and Reliability, Phase 2

## Goal

Make browsing remain responsive while thumbnails are discovered, read, parsed, rendered, and cached. This phase builds on the persistent index, folder watcher, disk thumbnail cache, prioritized scheduler, virtualized collection, and shared WebGL renderer delivered by the first performance pass.

The work must improve measured behavior without changing file organization, internal or native drag-and-drop, model selection, slicer integration, portable metadata, or the visual identity of the application.

## Scope

This phase covers:

- local performance instrumentation;
- one coordinated thumbnail pipeline;
- bounded memory and queue growth;
- selected and visible work taking priority;
- concise queue feedback;
- repeatable cold and warm benchmarks;
- recovery from individual thumbnail failures.

Advanced 3MF component and plate navigation, general navigation polish, metadata relinking, saved filters, and the approved compact tag dropdown remain separate later phases.

## Current Behavior and Remaining Risks

The application already restores a persisted library index and reconciles it in the background. Thumbnail images are cached on disk, visible cards outrank nearby and folder-mosaic work, the grid is virtualized, and one WebGL renderer is reused.

The remaining risks are:

- rendering waits for browser idle twice, each with a timeout of up to 600 ms, which can make a healthy queue appear stalled;
- completed scheduler jobs retain their resolved data URLs for the rest of the session, duplicating the disk cache in memory;
- cache reads happen before scheduler coalescing, so multiple consumers may perform duplicate reads;
- rapidly visited cards continue as background work and can create a long tail of jobs;
- selected models have no priority above other visible models;
- the UI does not expose whether thumbnails are being read, rendered, or failing;
- there is no repeatable baseline report for comparing changes.

## Architecture

### Coordinated Thumbnail Service

Move cache lookup, embedded 3MF lookup, fallback rendering, and cache persistence behind one renderer-side thumbnail service. A request is identified by renderer version, canonical model path, size, and modification time before any asynchronous work starts.

All subscribers for the same identity share the complete pipeline, including disk lookup. A request can change priority while queued. Releasing a subscriber does not interrupt work that has already started.

The service has two bounded stages:

1. An I/O stage reads cached images and embedded 3MF previews with modest concurrency.
2. A render stage parses geometry and renders at most one generated thumbnail at a time.

An I/O cache hit never enters the render stage. ZIP, RAR, and 7Z files return their static archive fallback without entering either stage.

### Priority Model

Priorities, from highest to lowest, are:

1. the currently selected model;
2. visible model cards and list rows;
3. nearby virtualized items;
4. visible folder mosaics;
5. released or historical requests.

Higher-priority queued work can overtake lower-priority work. Started parsing or rendering is allowed to finish because it cannot be safely interrupted. A released request that has not started may remain as low-priority background work, but the number of historical requests is bounded. When the bound is exceeded, the oldest unstarted historical request is discarded and may be requested again later.

### Memory Policy

The scheduler retains jobs only while they are queued or running. A small, bounded handoff cache may retain recent completed results long enough to bridge the disk-cache write and immediate remounts, but it must have both an entry limit and a short expiration time.

Persistent image reuse belongs to the Electron disk cache. Data URLs must not accumulate without a bound in renderer memory. Metrics keep numbers and durations only, never image data or model contents.

### Main-Thread Budget

Remove the two long idle waits. Before a generated thumbnail starts, yield once so pending input and paint work can complete. Start no more than one heavy parse/render in a frame.

The first implementation keeps geometry parsing on the renderer thread and measures its cost. Worker-based parsing is a gated follow-up: it is introduced only if benchmark evidence shows repeated interaction stalls after queue and memory fixes. This avoids duplicating 3MF parsing and WebGL behavior prematurely.

### Local Diagnostics

Expose a read-only performance snapshot containing:

- queued and active jobs by priority and stage;
- cache hits and misses;
- embedded-preview hits;
- successful renders and failures;
- moving averages and worst observed duration for I/O, parsing/rendering, and total request time;
- discarded historical jobs;
- current and peak retained-result count.

Diagnostics are local and reset when the application closes. They must not contain full paths, filenames, notes, tags, thumbnails, model bytes, or other library content.

A Diagnostics section in Settings shows the snapshot and offers `Copiar diagnostico`. The copied text includes application/runtime versions and aggregate measurements only.

## User Experience

A compact status near the existing library status appears only when work lasts longer than 250 ms, avoiding flashes for cache hits. It uses these states:

- `Carregando miniaturas - N` while only I/O work remains;
- `Gerando miniaturas - N` while geometry rendering is queued or active;
- `Miniaturas concluidas` briefly after a non-trivial batch finishes;
- `Algumas miniaturas falharam` when the batch contains failures, with diagnostics available from Settings.

The status does not resize cards or the toolbar. It disappears automatically after completion. Individual failed models keep their stable extension fallback and do not retry continuously in the same session. A changed file signature or manual retry from model context permits a new attempt.

Scrolling away and returning reuses finished disk-cached work. The selected model receives immediate priority without clearing or reordering the grid. Folder mosaics never delay visible model cards.

## Benchmark Method

Add a development benchmark command that records aggregate timings from a chosen local library without modifying it. The report contains counts, size buckets, cache state, durations, queue peaks, and long-task counts; paths and filenames are redacted.

Run three scenarios:

1. Cold thumbnails: empty thumbnail cache, persisted library index available.
2. Warm thumbnails: populated cache and persisted index.
3. Scroll stress: repeatedly traverse the collection while uncached thumbnails are generated.

Record at least:

- time until cached grid is visible;
- time until first visible thumbnail;
- time until all initially visible thumbnails settle;
- full reconciliation duration;
- thumbnail queue peak;
- retained-result peak after the queue becomes idle;
- interaction stalls over 100 ms;
- cache-hit, embedded-hit, render, and failure counts.

The first run establishes the baseline. Acceptance requires the new implementation to preserve or improve startup timings, reduce retained thumbnail memory to a fixed bound, prevent unbounded historical queue growth, and ensure newly visible work overtakes background work. Numerical speed targets will be set from the baseline rather than invented before measurement.

## Error Handling and Safety

- One cache, embedded-preview, parse, or render failure settles only that model request.
- Failed generated thumbnails are not written to disk.
- Corrupt cached images are treated as misses and replaced lazily.
- WebGL context loss recreates the shared renderer for the next job.
- Diagnostic collection cannot delay or fail a thumbnail request.
- Benchmarking is read-only and never parses unsupported files.
- Existing filesystem path validation remains in Electron before any model or cache read.
- No telemetry, account, network request, or automatic report upload is introduced.

## Interfaces

The thumbnail service exposes:

- a request method receiving a model and initial priority;
- request handles that can update priority and release a subscriber;
- a subscription for aggregate queue status;
- a read-only diagnostics snapshot;
- a targeted retry method that clears only the selected model's session failure.

The scheduler exposes observable counts and supports bounded expiration of completed results and bounded cancellation of unstarted historical work. React components consume request handles and aggregate status; they do not directly coordinate cache reads or rendering.

## Testing

Add focused tests before each behavior change for:

- full-pipeline deduplication before cache reads;
- selected, visible, nearby, mosaic, and historical ordering;
- priority changes while queued;
- active-job completion after subscriber release;
- bounded removal of old unstarted historical jobs;
- bounded and expiring completed-result retention;
- cache-hit bypass of parsing/rendering;
- one failure not blocking subsequent jobs;
- failure retry rules;
- accurate status transitions without sub-250 ms flashing;
- diagnostics redaction and aggregate counters;
- stable card and toolbar geometry during status changes;
- unchanged folder mosaics, virtualized remounts, internal drag, and external drag contracts.

Run the complete unit suite and production build after each coherent implementation slice. Run cold, warm, and scroll benchmarks before and after the phase, then compare the generated aggregate reports.

## Delivery Order

1. Add benchmark fixtures, aggregate timing types, and a baseline report path.
2. Add scheduler observations and diagnostics without changing scheduling behavior.
3. Consolidate cache, embedded preview, rendering, and persistence into the thumbnail service.
4. Add selected priority and bounded historical work.
5. Bound completed-result retention and verify idle memory release.
6. Replace double idle waits with one paint-friendly scheduling gate.
7. Add delayed aggregate status and Settings diagnostics.
8. Run regression tests and compare cold, warm, and scroll-stress reports.
9. Decide from evidence whether worker-based parsing deserves a separate design.

## Acceptance Criteria

- Warm startup still displays the cached library before reconciliation completes.
- A cache hit does not parse model geometry or enter the render queue.
- Selecting or scrolling to a model moves its queued request ahead of mosaic and historical work.
- Fast scrolling cannot grow unstarted historical work beyond its configured bound.
- Completed image data retained in memory remains within its configured entry and time limits.
- A bad STL or 3MF does not prevent later thumbnails from completing.
- Queue feedback appears only for meaningful work and never shifts the card layout.
- Diagnostics contain no identifying library data.
- All existing unit tests, new focused tests, the production build, and native/internal drag contracts pass.

## Deferred Work

- Worker-based geometry parsing without benchmark evidence.
- General navigation and keyboard polish.
- External rename/move metadata relinking.
- Advanced multi-plate and component-aware 3MF viewing.
- Virtual collections, saved filters, and the approved compact tag dropdown.
- Packaging and installer work.
