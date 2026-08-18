# Agent instructions

## Product name

Colony is the current product name. Sweat is the legacy name.

- Use **Colony** for all new product work, user-facing copy, documentation, and
  present/future descriptions of the product.
- Do not introduce new user-visible references to **Sweat**.
- Keep existing compatibility-sensitive identifiers unchanged unless a task
  explicitly scopes their migration. This includes `SWEAT_*`, `sweat://`,
  `com.sweat.desktop`, `.sweat`, API headers, storage keys, database names,
  branch prefixes, package names, and repository names.
- In legacy documentation, use **Sweat** only when referring to one of those
  existing identifiers or describing historical behavior.

## Agent skills

### Issue tracker

PRDs and issues use local Markdown under `.scratch/<feature>/`. See
`docs/agents/issue-tracker.md`.

### Triage labels

Use the standard triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.

### Design

UI work follows the Colony styleguide. See `docs/design/styleguide.md`.
