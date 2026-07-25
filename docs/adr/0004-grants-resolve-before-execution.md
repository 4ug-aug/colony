# Resolve grants before the executor starts a run

Status: accepted

The generic run executor receives already-resolved capability grants. It does
not inspect tenant connections, agent roles, issue context, approval policy, or
provider-specific resources to decide authority.

A caller resolves those concerns through a separate policy/composition layer,
which may later depend on a grant-resolver port. The executor only creates the
granted MCP sessions, binds them to the sandbox runtime, and revokes them at
cleanup.

This keeps execution reusable for runs with no external capability, an uploaded
artifact, a GitHub repository, or future providers.
