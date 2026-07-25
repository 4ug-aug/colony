# Run storage starts in memory behind a port

Status: accepted

The generic run executor depends on a run-store port for creating, reading, and
recording lifecycle transitions of runs. The first implementation is in-memory.

This keeps the first vertical slice focused on execution rather than recovery,
while making durability an adapter decision. A later file-backed or database
run store must implement the same port; it does not change run, input, grant,
or sandbox semantics.

An in-memory store loses active and historical runs on process restart. Restart
recovery, distributed coordination, and scheduling are explicitly deferred.
