---
status: accepted
---

# Agents learn about pull request feedback by polling GitHub

When a person reviews a pull request an agent opened, the agent should act on
it. A Colony server accepts no incoming connections, so GitHub webhooks cannot
reach it. It can call GitHub, as the workspace's GitHub App.

The server records a **Watched pull request** whenever an agent run opens one
(`github.create_pull_request`) or pushes to one (`github.push_to_pull_request`).
The record holds the agent, the run's Responsible Account, the run's Issue if
any, and a feedback cursor. A watcher polls GitHub about every 2 minutes. Each
tick makes one repository-wide listing of recently updated pull requests, then
fetches reviews and comments only for watched ones that changed. It stops
watching once a pull request is merged or closed.

**Pull request feedback** is a submitted review, or a pull-request comment, from
an author with write access who is not a bot. Inline comments count as part of
their review. Failed CI counts too. Check results don't change a pull request's
update time, so the watcher checks each head commit until all its check runs
complete, then reports failures once for that commit. This replaces
`github.wait_for_pull_request_checks`, which kept a run idle while CI ran.
Feedback goes back to where the work came from. For an Issue, an Issue-linked
run starts with the feedback added to its task. Otherwise, a message from the
account goes into its Chamber with the agent, which covers Chamber, Room,
Schedule, and Oneshot runs alike. Approvals start nothing.

Rejected:
- A webhook relay (smee.io, a tunnel): instant, but it adds a third-party service
  to run and trust, and two minutes is fast enough for reviews.
- A Schedule that asks an agent to check its pull requests: a model call every
  tick even when nothing changed, and agents don't know which pull requests
  are theirs.
- Watching every pull request in the repository: agents would answer reviews
  meant for people.
- Keeping `github.wait_for_pull_request_checks`: a run waiting on CI holds a
  sandbox and a context window for minutes and still misses failures that come
  after it gives up.
- Delivering to the original Room thread: Room runs are shared, and a
  review-driven run belongs with the account accountable for it.
