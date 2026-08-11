# Oneshot runs are private, panel-only, and room-independent

Accounts need to dispatch a bounded agent run from anywhere for quick work
(create an Issue, look something up) without tying it to a Room or inventing
Chat first. A **Oneshot run** is that path: an explicit grant-context marker
(not “missing parent ids”), normal definition capability resolution without
`roomId`, strictly one Task and one final output via invocation instructions,
and a private floating panel as the only result surface — close cancels and
discards; no durable inbox, Attention, or workspace broadcast in v1. We
rejected Chat-first (multi-turn conversation home before the dispatch job), a
durable personal run inbox, and stretching Schedule into ad-hoc runs. Warm
follow-ups and attachments stay out of scope until a dedicated Chat or richer
Oneshot surface earns them.
