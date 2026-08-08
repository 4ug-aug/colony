# Bind confirmed Issues to Code Grill session branch

## Description

When Accounts **confirm** an Issue tree from a successful **Code Grill** (after
materialize), write the Grill’s materialized session branch onto the relevant
Issues as their **Issue branch** binding (typically the parent and children that
should share the initiative line; unset children may rely on inheritance from
GRL-009).

General Grills do not set Issue branches via this path.

## Why is this important?

Connects planning output to execution: later Issue-linked coding runs prepare
from / PR into the same initiative branch the design language was materialized
onto.

## Acceptance Criteria

- [ ] Confirming Issues from a Code Grill sets Issue branch to the materialized
      session branch where appropriate
- [ ] Inheritance works for children left unset (GRL-009)
- [ ] General Grill confirm does not require or invent a repository branch
- [ ] Confirm without a successful materialize cannot bind a missing branch
      (ordering: materialize before or as part of successful Code completion)

## Additional Information (Optional)

- Parent: GRL-000
- Depends on: GRL-007, GRL-011
- Execution path for the binding: GRL-010
