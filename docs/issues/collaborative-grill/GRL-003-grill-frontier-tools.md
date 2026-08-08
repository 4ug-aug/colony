# Agent tools to publish Grill frontier

## Description

Give the grilling agent first-party tools (or equivalent capability) to publish
and update the authoritative **Grill frontier** for the active Grill: the
current round’s questions and any agent-side framing needed so the platform can
render structured frontier cards.

Do not treat freeform timeline markdown as the source of truth for what must be
answered or submitted. Parsing markdown questions is explicitly out of scope;
tools (or another structured channel) are required.

## Why is this important?

Hybrid UX (GRL-004) only works if the platform receives a structured frontier.
Brittle parse-of-chat would break shared submit and multiplayer answering.

## Acceptance Criteria

- [ ] Grilling agent can set/replace the current frontier questions via a
      structured interface
- [ ] Frontier updates are visible to Grill participants through the session
      model (GRL-001)
- [ ] Timeline narration may exist but is not required to submit a round
- [ ] Capability grant scope for these tools is defined for Grill-linked runs
      ([NEEDS CLARIFICATION: exact capability id naming])

## Additional Information (Optional)

- Parent: GRL-000
- Depends on: GRL-001
- Pairs with: GRL-005 (tools available inside the warm Grill-linked run)
