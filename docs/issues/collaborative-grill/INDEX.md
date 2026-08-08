# Collaborative Grill — issue breakdown

Parent initiative for multiplayer, workspace-native grilling (full
grill-with-docs loop: align → durable design language → Issues).

Canonical language: root `CONTEXT.md` (**Grill**, **Code Grill**, **General
Grill**, **Doc**, **Grill frontier**, **Grill Skill**, **Issue branch**).

Decisions: `docs/adr/0018-issue-branch-binding.md`,
`docs/adr/0019-attention-may-target-a-grill.md`,
`docs/adr/0020-grill-linked-follow-up-runs.md`.

## Issue tree

| ID | Title | Depends on | Good parallel with |
| --- | --- | --- | --- |
| [GRL-000](./GRL-000-parent-collaborative-grill.md) | Parent: Collaborative Grill | — | (tracking only) |
| [GRL-001](./GRL-001-grill-session-model.md) | Grill session model & API | — | GRL-009 |
| [GRL-002](./GRL-002-workspace-docs.md) | Workspace Docs (General Grill) | — | GRL-001, GRL-009 |
| [GRL-003](./GRL-003-grill-frontier-tools.md) | Agent tools to publish Grill frontier | GRL-001 | GRL-005 |
| [GRL-004](./GRL-004-enter-the-grill-ui.md) | Enter the Grill UI + frontier UX | GRL-001, GRL-003 | GRL-006 |
| [GRL-005](./GRL-005-grill-linked-follow-up-runs.md) | Grill-linked warm follow-up runs | GRL-001 | GRL-003, GRL-009 |
| [GRL-006](./GRL-006-grill-attention-invites.md) | Grill invites create Attention | GRL-001 | GRL-004 |
| [GRL-007](./GRL-007-grill-issue-proposal-confirm.md) | Wrap-up Issue proposal + confirm | GRL-001 | GRL-005 |
| [GRL-008](./GRL-008-general-grill-doc-persist.md) | Persist General Grill Doc on success | GRL-001, GRL-002, GRL-007 | GRL-011 |
| [GRL-009](./GRL-009-issue-branch-binding.md) | Issue branch binding + inheritance | — | GRL-001 |
| [GRL-010](./GRL-010-issue-run-from-issue-branch.md) | Issue-linked runs use Issue branch | GRL-009 | GRL-005 |
| [GRL-011](./GRL-011-code-grill-materialize.md) | Code Grill materialize remote branch | GRL-001, GRL-009 | GRL-008 |
| [GRL-012](./GRL-012-code-grill-issue-branch-link.md) | Bind confirmed Issues to session branch | GRL-007, GRL-011 | GRL-010 |

## Suggested delegation batches

1. **Foundation (parallel):** GRL-001, GRL-002, GRL-009  
2. **Session mechanics (parallel after 001):** GRL-003, GRL-005, GRL-006  
3. **Surfaces + wrap-up:** GRL-004, GRL-007  
4. **Artifact sinks (parallel):** GRL-008, GRL-010, GRL-011  
5. **Code Grill close-out:** GRL-012  

Do not implement beyond these decisions without a new grill; open questions
left explicit in individual issues.
