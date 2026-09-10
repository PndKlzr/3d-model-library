# Thumbnail Performance Baseline

This document is the durable Phase 2 reference for future thumbnail-performance changes. It is not a legacy comparison: the benchmark harness was introduced with the bounded scheduler, so no pre-change result exists to report.

## Method

Each command creates a disposable application profile. Setup scans the selected library once to seed that profile's persisted index, then measurement begins. The benchmark restores the cached index, starts a fresh library reconciliation without waiting for it, and launches the hidden renderer with background throttling disabled. The selected library remains read-only and folder monitoring is not started.

The report uses these separate milestones:

- `Cached index ready`: measured startup time until the isolated persisted index has been restored.
- `Library reconciliation settled`: measured startup time until the concurrent filesystem scan has completed.
- `First visible thumbnail`: thumbnail-pass time until the first initially visible request succeeds.
- `Initially visible settled`: thumbnail-pass time until all initially visible requests settle.
- `Thumbnail pass settled`: thumbnail-pass time until all requests for the scenario settle.

The scroll scenario advances viewport windows on frame boundaries while prior requests remain in flight. Overlapping handles are reprioritized, handles leaving the nearby range are released to historical priority, and the traversal moves down and back before final settlement. This creates queue pressure that can expose historical discards and whether newly selected work overtakes released work.

## Scenario Results

The corrected cold, warm, and scroll measurements are pending controller regeneration. Earlier numbers were removed because the previous scroll scenario serialized complete windows and the startup fields did not describe what they measured.

| Metric | Cold thumbnails | Warm thumbnails | Scroll stress |
| --- | ---: | ---: | ---: |
| Cached index ready | pending | pending | pending |
| Library reconciliation settled | pending | pending | pending |
| First visible thumbnail | pending | pending | pending |
| Initially visible settled | pending | pending | pending |
| Thumbnail pass settled | pending | pending | pending |
| Queue peak | pending | pending | pending |
| Retained-result peak | pending | pending | pending |
| Cache hits | pending | pending | pending |
| Cache misses | pending | pending | pending |
| Embedded thumbnails | pending | pending | pending |
| Generated renders | pending | pending | pending |
| Failures | pending | pending | pending |
| Discarded historical jobs | pending | pending | pending |
| Long tasks | pending | pending | pending |
| Longest task | pending | pending | pending |
| Average I/O duration | pending | pending | pending |
| Maximum I/O duration | pending | pending | pending |
| Average render duration | pending | pending | pending |
| Maximum render duration | pending | pending | pending |

## Reproduction

Build first, then run each command separately with an absolute local library path:

```powershell
npm run build
npm run benchmark:thumbnails -- --library "C:\Models" --scenario cold
npm run benchmark:thumbnails -- --library "C:\Models" --scenario warm
npm run benchmark:thumbnails -- --library "C:\Models" --scenario scroll
```

Generated JSON belongs in `benchmark-results/`, which is intentionally ignored by Git. Do not copy raw reports into issues without checking their aggregate-only schema.
