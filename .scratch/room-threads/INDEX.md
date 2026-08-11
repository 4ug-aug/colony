# Room threads issue breakdown

All slices are AFK-ready and use the language and decisions in `CONTEXT.md`,
`docs/room-threads.md`, and ADR 0022.

| Issue | Slice | Blocked by |
| --- | --- | --- |
| [01](./issues/01-human-room-thread.md) | Human Room-thread foundation | — |
| [02](./issues/02-thread-rail-interactions.md) | Thread rail interactions | 01 |
| [03](./issues/03-top-level-run-results-in-thread.md) | Top-level run output routing | 01 |
| [04](./issues/04-agent-invocation-inside-thread.md) | Agent invocation inside a thread | 03 |
| [05](./issues/05-thread-attention.md) | Thread Attention and Room unread isolation | 01 |
| [06](./issues/06-threaded-message-search.md) | Threaded universal-search navigation | 01 |

## Delegation batches

1. Start 01 alone.
2. After 01, run 02, 03, 05, and 06 in parallel.
3. Start 04 after 03.
