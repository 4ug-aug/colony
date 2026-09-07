# UI update measurements — 2026-09-07

Run from `project/gui`:

```sh
NODE_ENV=development CHECK_UI=1 CHECK_MEDIA=1 bun run benchmarks/ui-updates.tsx
```

The benchmark renders the actual `Timeline` and `ToolCallDetailsList` in React development mode with Bun 1.3.5 and Happy DOM. Each scenario runs three passes, with five warmup updates and twenty measured updates per pass. Agent definitions are seeded into QueryClient. No dependencies were added.

## Measurements and changes

| Workload | Before | After | Evidence |
|---|---|---|---|
| 100-message timeline, unchanged content with fresh action callbacks | 33.00–34.39 ms median in passes 2–3 | 27.50–29.39 ms in final verification passes 2–3 | Same actual Timeline and fixture; message editing also checked |
| Append a tool call to 40 completed tools, growing to 60 | 9.79–10.09 ms median in passes 2–3 | 0.36–0.40 ms in final verification passes 2–3 | Approximately 96% less update CPU time |
| Format hidden results (28,424 bytes per result) | 40 JSON parses on mount; 800 during twenty updates | 0 on mount and during updates | Instrumented JSON.parse; asserted by CHECK_UI |
| Register unchanged media-query listeners across twenty timeline updates | 2,000 registrations | 0 registrations | Instrumented addEventListener; asserted by CHECK_MEDIA |

1. Reuse the Room timestamp's `Intl.DateTimeFormat` rather than construct one for every message, thread chip, or search result. An intermediate run with only this change measured 25.87–27.27 ms per timeline update (passes 2–3). Date output is checked against the original formatting options, including epoch, negative timestamps, DST dates, and invalid input.
2. Move tool payload formatting into the collapsible panel's child component, which Base UI mounts on expansion. With only lazy formatting plus the date change, tool updates measured 6.05–6.79 ms and hidden-result parses dropped to zero. Then memoize each tool row using its Step and result references, rather than the fresh wrapper made by pairSteps on every update. Final tool updates are approximately 96% cheaper. Expanded details still receive new results, errors, and preview-length changes.
3. Stabilize useMediaQuery's subscription callback by query. This removes listener churn in message toolbars, rails, and reduced-motion consumers. The counter proves the reduction; its independent elapsed-time gain is too small relative to run-to-run variation to claim a precise percentage.

The tool list is shared by Run Activity, Chat transcripts, and Oneshot. Lazy formatting applies to all callers. Memoization pays off when the caller retains existing Step references; a caller that reconstructs every Step can still rerender rows.

## Validation

The runnable benchmark asserts message edits, appended tool calls, expansion, updates to an open result, compact result limits, failure status, media-query resize changes, replacing a query, and listener cleanup after unmount. It also asserts zero hidden-result parses and zero subscription churn. Happy DOM's media-listener cache starts false; the resize check primes its initial true state before crossing a breakpoint.

Seven targeted unit tests pass, along with TypeScript, targeted ESLint, production build, and git diff whitespace checks.

These are synchronous React/DOM CPU measurements, not browser frame times. CSS layout, paint, compositor/GPU cost, real input scheduling, and the native WKWebView are not included. The timeline still rerenders on parent updates and remains above 16.7 ms in this 100-message development fixture; this work does not claim to make every screen sustain 60 fps. Timings vary between runs, so deterministic work counters are used as regression checks instead of machine-dependent timing thresholds.
