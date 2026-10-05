---
status: accepted
---

# Agents consult each other through Chambers

An agent in a Chamber sometimes needs a specialist: Antboy asked about code
should be able to ask the Software engineer. Nothing let one agent reach
another; an agent's `@mention` in `workspace.post_message` is inert text.

A **Consultation** is one agent asking another a question on behalf of the
Chamber's account. Chamber runs get `workspace.ask_agent({ agentDefinitionId,
question })`. The question is posted as a top-level message authored by the
asking agent in the account's Chamber with the target agent (created if
missing), and starts an ordinary Chamber run there: the target sees its usual
Chamber history, keeps its full toolset, runs for the same account, and queues
behind a run already active in that conversation. Its answer is posted there as
usual and returned as the tool result; the asking agent then replies in its own
Chamber.

The asking run waits for the answer, bounded only by its own run limits (the
tool-call timeout is raised to match). Until runs can be steered or
interrupted, waiting is what lets the asker use the answer. The account stops a
Consultation with the existing Cancel: cancelling the target returns "stopped
by the user" to the asker, and cancelling the asker cancels the Consultations it
is waiting on.

Consultations are visible but quiet: both messages live in the target's
Chamber, marked as a consultation delivery, and raise no Attention; the asker's
reply in its own Chamber does. There is no depth or count limit. The one rule
is no direct cycle: an agent cannot consult an agent that is waiting on it in
the same chain.

This applies only to Chamber runs, so nothing private reaches a shared Room.

Rejected: a thread in the asker's Chamber (the exchange belongs with the agent
being asked, where the account can continue it); an invisible nested run (no
audit trail); answering asynchronously by waking the asker later (needs a
second run per Consultation for no gain while runs cannot be interrupted);
read-only specialists (a specialist is valuable for its tools); hop and count
limits (the account can stop a Consultation, and cycles are refused); A2A for
now (all agents are in-process; nothing crosses an organisation).
