# Thumbnail Performance Baseline

This is the durable Phase 2 reference for future thumbnail-performance changes. It is not a comparison against the removed legacy queue: the benchmark harness was introduced with the bounded scheduler, so inventing a pre-change number would be misleading.

## Environment

- Recorded: 2026-09-10
- Application: 3D Model Library 0.1.0
- Runtime: Electron 33.2.1, Chromium 130.0.6723.137
- Hardware: NVIDIA GeForce RTX 4060, Intel Xeon E5-2690 v4
- Library: 449 STL/3MF models
- Size buckets: 265 below 1 MiB, 138 from 1 to 10 MiB, 46 above 10 MiB
- Privacy: isolated temporary profile; aggregate-only reports; no paths or filenames retained

Times below are milliseconds, rounded to three decimal places from the generated JSON reports. `Library scan ready` is measured in the main process. `Full reconciliation` is the measured thumbnail pass and excludes process startup and the warm scenario's unmeasured cache-population pass.

## Scenario Results

| Metric | Cold thumbnails | Warm thumbnails | Scroll stress |
| --- | ---: | ---: | ---: |
| Library scan ready | 123.439 | 122.194 | 123.840 |
| First visible thumbnail | 327.500 | 4.200 | 353.400 |
| Initially visible settled | 6,269.000 | 18.100 | 6,976.200 |
| Full reconciliation | 51,053.700 | 323.200 | 54,466.500 |
| Queue peak | 24 | 24 | 48 |
| Retained-result peak | 8 | 0 | 8 |
| Cache hits | 0 | 449 | 3,005 |
| Cache misses | 449 | 0 | 449 |
| Embedded thumbnails | 76 | 0 | 76 |
| Generated renders | 373 | 0 | 373 |
| Failures | 0 | 0 | 0 |
| Discarded historical jobs | 0 | 0 | 0 |
| Long tasks | 95 | 0 | 98 |
| Longest task | 2,402.000 | 0 | 2,539.000 |
| Average I/O duration | 222.788 | 9.794 | 37.553 |
| Maximum I/O duration | 6,134.400 | 17.800 | 6,131.400 |
| Average render duration | 1,431.553 | 0 | 906.009 |
| Maximum render duration | 5,841.300 | 0 | 6,990.600 |

## Interpretation

### Cold thumbnails

The first uncached thumbnail appeared in about 0.33 seconds. Rendering all 449 models took about 51.05 seconds. All models completed, no historical work was discarded and no thumbnail failed.

### Warm thumbnails

With the isolated cache populated, the first thumbnail appeared in 4.2 ms and all 449 models reconciled in about 0.32 seconds. Every model was a cache hit and no render work ran.

### Scroll stress

The scenario traverses fixed windows down and back up. The 3,005 cache hits show that revisited windows reused completed work. Its peak of 48 represents the combined bounded I/O and render stages, while retained completed results stayed capped at eight.

## Reproduction

Build first, then run each command separately with an absolute local library path:

```powershell
npm run build
npm run benchmark:thumbnails -- --library "C:\Models" --scenario cold
npm run benchmark:thumbnails -- --library "C:\Models" --scenario warm
npm run benchmark:thumbnails -- --library "C:\Models" --scenario scroll
```

Generated JSON belongs in `benchmark-results/`, which is intentionally ignored by Git. Do not copy raw reports into issues without checking their aggregate-only schema.
