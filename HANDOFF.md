## Verdict

Not approvable under the thermo-nuclear bar. Tests are strong, but several structural boundaries are unsafe or misleading.

## Findings

1. P0 — GitHub publishing silently corrupts some repositories.
    project/mcp/github.ts:240 and project/mcp/github.ts:292 duplicate handwritten Git-tree reconstruction. Both decode every file as UTF-8 and force mode 100644. Binary files,
    executables, and symlinks will be published incorrectly.

    Extract one tree-materialization path using raw bytes/base64 and the actual Git object mode/type. Add binary, executable, and symlink tests.

2. P1 — Runs have two owners and creation is non-atomic.
    project/gui/src/server/coordinator.ts:314 starts the in-memory run, looks it up again, then separately persists its projection. Execution is already scheduled by project/runs/
    index.ts:400. If SQLite insertion fails, the API returns 502 while an orphan sandbox continues running; subsequent events are discarded by project/gui/src/server/
    coordinator.ts:180.

    Give runs one canonical store, or make durable registration part of startRun before scheduling. Return the created summary directly and delete the listRuns().find(...)
    compensation.

3. P1 — Output limits do not actually limit process memory.
    project/sdk/src/index.ts:25 accumulates complete stdout/stderr without bounds. project/runs/index.ts:252 only bounds the stored projection after chunks are already retained,
    and final output is truncated only at project/runs/index.ts:330. A noisy container can exhaust host memory despite maxOutputBytes.

    Enforce a byte-bounded ring buffer at the command-reader boundary.

4. P1 — There is no canonical client/server protocol.
    The server contract in project/gui/src/server/coordinator.ts:47 is manually duplicated and weakened in project/gui/src/features/rooms/types.ts:3. Author.kind becomes optional,
    run fields drift, and incoming messages are blindly cast after JSON.parse in project/gui/src/features/rooms/use-rooms.ts:94. The server also imports authorization logic from a
    UI feature at project/gui/src/server/coordinator.ts:17.

    Move domain and wire types into one dependency-free shared module, decode the stream once at the boundary, and place authorization policy outside features/.

5. P1 — The coordinator is a growing composition-root/router/domain monolith.
    project/gui/src/server/coordinator.ts:143 owns CORS, tickets, routing, authorization, room membership, run projection, WebSockets, and process bootstrap. Its mirrored
    integration test is already 1,507 lines.

    Move bootstrap from project/gui/src/server/coordinator.ts:487 into main.ts; use the existing admission-handler pattern for room/run HTTP handling. Keep the coordinator as
    transport wiring.

6. P1 — SQLite invariants are asserted rather than enforced.
    project/gui/src/server/room-store.ts:101 claims database strings are valid unions, while project/gui/src/server/room-store.ts:193 casts step kinds and unknown author kinds
    silently become users. The migrations have no CHECK constraints. Private-room creation also writes the room and owner membership separately at project/gui/src/server/room-
    store.ts:292.

    Add native SQLite constraints for states/kinds/visibility and a transaction for multi-write invariants.

7. P1 — The advertised quality gate is materially incomplete.
    Makefile:91 runs only GUI tests, omitting roughly half the suite; make check omits lint, formatting, root typecheck, and Cargo. bun run lint currently reports 81 errors, while
    formatting scans ignored build artifacts and fails. Root TypeScript checking also fails on dependency declarations unless skipLibCheck is supplied.

    Make one root check run the root test suite, both TypeScript projects, configured lint/format checks, production build, and Cargo tests.