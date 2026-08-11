# In-place room message edit (text only)

Room messages, including thread replies, may be rewritten in place by their
author: same id and `createdAt`, optional `editedAt`, live `message.updated`
fan-out. Editing does not truncate later history, restart or cancel runs, or
recompute Attention — linked runs keep the task snapshotted at start.
ChatGPT-style fork/regenerate and correction-append were rejected so a shared
Room stays a single timeline without cascading side effects from a text fix.
