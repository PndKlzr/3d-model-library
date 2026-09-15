# Thumbnail Worker Design

## Goal

Keep the library responsive during cold STL, 3MF, and OBJ thumbnail generation without changing model files, metadata, drag behavior, cache keys, or the right-side viewer.

## Evidence

The 2026-09-15 session recorded 1,735 renders averaging 173 ms and 976 main-thread long tasks, while cached thumbnails appeared quickly. An isolated Electron 33.2.1 probe on this Windows machine created WebGL2 inside a Worker and exported a WebP image. This proves platform capability, not correctness or speed for actual models.

## Architecture

Keep the existing I/O scheduler, single-job render scheduler, priority model, and disk cache. Replace only the synchronous geometry render operation with a lazy, persistent module Worker. The Worker owns an OffscreenCanvas and Three.js WebGLRenderer, parses the model with the existing STL/3MF/OBJ code, and returns a 260x180 image. A single job runs at a time; two workers are out of scope.

The renderer thread retains the original model bytes so it can use the existing renderThumbnail function if Worker initialization, GPU setup, or transport fails. A model parse error is reported as a failed thumbnail, not retried on the main thread. A timeout terminates the stuck Worker and leaves that model failed so a long parse cannot block later items. All IPC/session checks and stale-result protections remain in the existing service.

## Validation And Rollback

Use a testable Worker client with a fake Worker for startup, response, failure, timeout, and fallback contracts. Test that the thumbnail service chooses Worker output and falls back only for Worker availability failures. Build both development and production bundles. Run a real-model isolated smoke test with STL, 3MF, and OBJ, including a multi-object 3MF, before enabling the path in the live app. Compare cold/warm thumbnail timing, main-thread long tasks, and failures against the current baseline. If the real-model smoke test fails, leave the current renderer as default and stop; the new code is removable in one Git commit.

No library contents, paths, model bytes, notes, or tags enter diagnostic reports.
