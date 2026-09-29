# Thumbnail Performance Baseline

This document is the durable Phase 2 reference for future thumbnail-performance changes. It is not a legacy comparison: the benchmark harness was introduced with the bounded scheduler, so no pre-change result exists to report.

## Method

Each command creates a disposable application profile. Setup scans the selected library once to seed that profile's persisted index, then measurement begins. The benchmark restores the cached index, starts a fresh library reconciliation without waiting for it, and launches the hidden renderer with background throttling disabled. The selected library remains read-only and folder monitoring is not started.

The report uses these separate milestones:

- `Cached index ready`: measured startup time until a newly opened store restores the isolated persisted index.
- `Cached grid visible`: measured startup time until React commits the first cached-model grid and acknowledges its frame.
- `Library reconciliation settled`: measured startup time until the concurrent filesystem scan has completed.
- `First visible thumbnail`: thumbnail-pass time until the first initially visible request succeeds.
- `Initially visible settled`: thumbnail-pass time until all initially visible requests settle.
- `Thumbnail pass settled`: thumbnail-pass time until all requests for the scenario settle.

The scroll scenario advances viewport windows on frame boundaries while prior requests remain in flight. Overlapping handles are reprioritized, handles leaving the nearby range are released to historical priority, and the traversal moves down and back before final settlement. This creates queue pressure that can expose historical discards and whether newly selected work overtakes released work.

## Scenario Results

Recorded on 2026-09-11 with 3D Model Library 0.1.0, Electron 33.2.1 and Chromium 130.0.6723.137, running on an NVIDIA GeForce RTX 4060 and Intel Xeon E5-2690 v4. The library contained 449 STL/3MF models: 265 below 1 MiB, 138 from 1 to 10 MiB, and 46 above 10 MiB. Times are milliseconds, rounded to three decimal places from the aggregate JSON reports.

| Metric | Cold thumbnails | Warm thumbnails | Scroll stress |
| --- | ---: | ---: | ---: |
| Cached index ready | 4.217 | 4.338 | 4.185 |
| Cached grid visible | 545.263 | 579.537 | 576.543 |
| Library reconciliation settled | 579.788 | 607.308 | 605.114 |
| First visible thumbnail | 454.900 | 4.400 | 613.700 |
| Initially visible settled | 6,411.300 | 17.700 | 6,488.000 |
| Thumbnail pass settled | 53,472.500 | 324.000 | 12,517.100 |
| Queue peak | 24 | 24 | 112 |
| Retained-result peak | 8 | 0 | 8 |
| Cache hits | 0 | 449 | 0 |
| Cache misses | 449 | 0 | 107 |
| Embedded thumbnails | 76 | 0 | 23 |
| Generated renders | 373 | 0 | 63 |
| Failures | 0 | 0 | 0 |
| Discarded historical jobs | 0 | 0 | 734 |
| Long tasks | 98 | 0 | 24 |
| Longest task | 2,597.000 | 0 | 1,530.000 |
| Average I/O duration | 158.789 | 9.758 | 273.208 |
| Maximum I/O duration | 6,240.900 | 18.100 | 3,024.500 |
| Average render duration | 1,553.046 | 0 | 5,373.480 |
| Maximum render duration | 6,388.900 | 0 | 9,286.200 |
| Average end-to-end request | 1,608.405 | 10.214 | 860.831 |
| Maximum end-to-end request | 6,695.500 | 18.700 | 11,219.400 |

In all three scenarios the cached grid committed before filesystem reconciliation settled. The warm pass served all 449 models from the isolated cache in 324 ms. Cold and warm traversals completed every model without discards. Scroll stress intentionally moved faster than generation: released work became historical, the bounded schedulers discarded 734 obsolete jobs, and newly visible work continued with zero failures.

## Reproduction

Build first, then run each command separately with an absolute local library path:

```powershell
npm run build
npm run benchmark:thumbnails -- --library "C:\Models" --scenario cold
npm run benchmark:thumbnails -- --library "C:\Models" --scenario warm
npm run benchmark:thumbnails -- --library "C:\Models" --scenario scroll
```

Generated JSON belongs in `benchmark-results/`, which is intentionally ignored by Git. Do not copy raw reports into issues without checking their aggregate-only schema.
