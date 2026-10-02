---
status: accepted
---

# GitHub is a workspace setting backed by a GitHub App

Colony authenticates to GitHub as a GitHub App, configured by an admin in
Workspace settings and stored encrypted in `workspace_github_config` (App ID,
private key, installation, repository, base). This replaces the
fine-grained PAT in `SWEAT_GITHUB_TOKEN` from ADR 0001 and the
`SWEAT_GITHUB_*` / `SWEAT_VERIFY_COMMAND` env vars; as in ADR 0017, env vars
are not a fallback, and the server only warns when they are still set.

The roster resolves the GitHub adapter on every run, so saving or clearing the
setting needs no restart. Save verifies the key, the installation on the
repository, and the base branch before anything is written. An agent with
GitHub access fails to start while GitHub is unconfigured instead of booting
without a repository.

Rejected: keeping the PAT as a second mode (two forms and validation paths for
one capability), and GitHub's manifest flow for now (add it when other teams
self-host). A workspace still has one repository.

The publish-time verify command (`SWEAT_VERIFY_COMMAND`, ADR 0025) is dropped
rather than moved: it gated every GitHub tool, including read-only ones, and
duplicated what the agent runs in its sandbox and what pull-request checks run
on GitHub. GitHub tools are granted whenever GitHub is configured.
