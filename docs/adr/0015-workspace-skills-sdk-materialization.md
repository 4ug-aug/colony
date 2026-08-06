# Workspace skills staged for SDK materialization

Status: accepted

Sweat owns a workspace skill catalog of markdown Agent Skills packages and
attaches them to agent definitions as configuration. At run start it stages
only that definition's attached packages into each runtime's expected layout
(Cursor: `/work/.cursor/skills/…` with `settingSources: ["project"]`; OpenAI
Agents: the SDK skills capability against a staged skills root) so the
framework discovers and loads them. Skill bodies are not inlined into system
instructions. Packages are markdown only — no scripts or other executables.
Enabling Cursor project settings for coding runs intentionally also exposes
the checked-out repo's `.cursor` project config alongside staged workspace
skills. Rejected: instruction inlining, per-run skill selection, inventing a
Sweat-side progressive-disclosure loader, and importing executable skill
scripts in this slice.
