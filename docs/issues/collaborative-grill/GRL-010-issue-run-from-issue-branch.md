# Issue-linked runs use Issue branch

## Description

When an Issue-linked run starts and the Issue has an effective **Issue branch**
(own or inherited), prepare the Git workspace from that branch tip rather than
only the workspace default base.

Publish keeps a platform-assigned run branch (`sweat/<runId>`-style). The pull
request’s merge **base** is the Issue branch when bound/inherited, so child
Issues can integrate into the initiative line before that line merges to the
repository default base (landing to default base remains out of band in v1).

## Why is this important?

Binding alone is useless if runs still always seed from `main` and PR into
`main`. This closes the execution path for ADR 0018.

## Acceptance Criteria

- [ ] Issue-linked prepare uses effective Issue branch revision when set
- [ ] Without an Issue branch, existing default-base behavior remains
- [ ] `github.create_pull_request` (or equivalent) targets the Issue branch as
      merge base when the Issue is branch-bound
- [ ] Parent cover / start-run rules unchanged except for which ref is prepared
- [ ] Concurrent runs on the same Issue branch still use distinct platform run
      branches

## Additional Information (Optional)

- Parent: GRL-000
- Depends on: GRL-009
- Today’s prepare is tarball-at-revision + local `sweat/<runId>`; remote refs
  for arbitrary branches at start are a platform gap this issue must close
  enough to support Issue branch checkout
