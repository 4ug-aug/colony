# Runs produce structured artifacts, not a communication channel

Status: accepted

Every run result includes its terminal outcome, runtime output, and a
collection of named artifacts. Artifacts are generic outputs created by the
runtime in the sandbox and collected by the executor; provider links such as a
pull-request URL can be represented as artifacts or artifact metadata.

The first implementation may keep artifacts in memory with the run record. A
future artifact store can persist files or large output behind a port.

Live agent updates, conversations, and operator messaging are deferred. They
will be a separate communication-channel capability, not an overloaded run
result or stdout stream.
