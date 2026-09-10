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

Recorded on 2026-09-10 with 3D Model Library 0.1.0, Electron 33.2.1 and Chromium 130.0.6723.137, running on an NVIDIA GeForce RTX 4060 and Intel Xeon E5-2690 v4. The library contained 449 STL/3MF models: 265 below 1 MiB, 138 from 1 to 10 MiB, and 46 above 10 MiB. Times are milliseconds, rounded to three decimal places from the aggregate JSON reports.

| Metric | Cold thumbnails | Warm thumbnails | Scroll stress |
| --- | ---: | ---: | ---: |
| Cached index ready | 2.859 | 2.983 | 2.913 |
| Library reconciliation settled | 383.498 | 101.344 | 99.031 |
| First visible thumbnail | 725.100 | 3.800 | 401.300 |
| Initially visible settled | 6,622.100 | 17.900 | 1,451.100 |
| Thumbnail pass settled | 51,952.500 | 332.500 | 12,988.600 |
| Queue peak | 24 | 24 | 112 |
| Retained-result peak | 8 | 0 | 8 |
| Cache hits | 0 | 449 | 0 |
| Cache misses | 449 | 0 | 146 |
| Embedded thumbnails | 76 | 0 | 22 |
| Generated renders | 373 | 0 | 68 |
| Failures | 0 | 0 | 0 |
| Discarded historical jobs | 0 | 0 | 721 |
| Long tasks | 94 | 0 | 28 |
| Longest task | 2,298.000 | 0 | 1,502.000 |
| Average I/O duration | 162.359 | 9.978 | 256.853 |
| Maximum I/O duration | 6,149.700 | 18.200 | 2,720.600 |
| Average render duration | 1,504.632 | 0 | 4,105.851 |
| Maximum render duration | 5,893.100 | 0 | 8,765.600 |
| Average end-to-end request | 1,575.331 | 10.476 | 926.025 |
| Maximum end-to-end request | 6,621.200 | 18.900 | 11,221.900 |

The warm pass served all 449 models from the isolated cache in 332.5 ms. Cold and warm traversals completed every model without discards. Scroll stress intentionally moved faster than generation: released work became historical, the bounded schedulers discarded 721 obsolete jobs, and newly visible work continued with zero failures.

## Reproduction

Build first, then run each command separately with an absolute local library path:

```powershell
npm run build
npm run benchmark:thumbnails -- --library "C:\Models" --scenario cold
npm run benchmark:thumbnails -- --library "C:\Models" --scenario warm
npm run benchmark:thumbnails -- --library "C:\Models" --scenario scroll
```

Generated JSON belongs in `benchmark-results/`, which is intentionally ignored by Git. Do not copy raw reports into issues without checking their aggregate-only schema.
