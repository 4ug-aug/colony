# Thread scroll measurement — 2026-09-07

Run `NODE_ENV=development CHECK_SCROLL=1 bun run benchmarks/thread-scroll.tsx` from `project/gui`.

Actual RoomThreadRail, React development build, Bun 1.3.5, Happy DOM, seeded QueryClient, 720-character Markdown per message/result, three passes of 60 synchronous scroll-handler calls after warmup. Thinking timer callbacks replay every five calls (12 ticks); this is deterministic CPU work, not a real-time browser FPS measurement. The thinking indicator is a sibling, as a working indicator elsewhere in the Room can be.

Final baseline pass:

| Scenario | Median / p95 per scroll | React commits |
|---|---|---|
| 3 messages | 1.37 / 2.13 ms | 60 |
| 3 run results | 8.81 / 10.92 ms | 60 |
| 10 messages | 2.90 / 4.81 ms | 60 |
| 10 run results | 27.39 / 34.63 ms | 60 |
| 5 run results + thinking | 14.23 / 18.50 ms | 72 |

After scroll fixes, steady scrolling has zero commits. Thinking alone still produced 12 commits, with a combined p95 of 0.14 ms: the dot timer was much smaller than the redundant rail rendering in this harness. After moving the dots to CSS, that scenario also has zero commits and zero dot timers. Steady-handler cost rounds to 0.00 ms at two decimals; this does not imply that browser scrolling or animation is free.

The original rail also assigned scrollTop=scrollHeight when crossing within 150 px of the bottom without new content. Happy DOM records 4000; a browser would clamp that to 3400 for this fixture, producing a 140 px jump from the requested 3260. The fixed rail retains 3260.

Checks cover zero steady-scroll commits, threshold crossing without snapping, new replies preserving position and showing the banner when scrolled up, clearing the banner near the bottom, and following new replies near the bottom. Unit tests verify scroll-state identity and existing unread-count behavior.

No fetches occurred during these seeded scroll samples. This does not measure live-server polling. CSS layout, paint, shimmer, compositor behavior, trackpad input, and the native WKWebView are outside this harness. The shimmer is unchanged; its GPU/paint cost remains unmeasured. Dot wave/spin timing is now a continuous CSS opacity fade over the same 640 ms cycle, with reduced-motion fallback retained.
