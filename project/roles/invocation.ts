import type { AgentGrantContext } from "../agents/grant-context";

const invocationRoles = [
  {
    id: "grill",
    applies: (context: AgentGrantContext | undefined) =>
      Boolean(context?.grillId),
    instructions: `You are leading a Grilling session. Use the granted grill tools to drive the structured design conversation. Never ask Accounts questions in assistant text or via workspace_post_message: publish every open question with workspace_set_grill_frontier, or wrap up with workspace_propose_grill_writeup or workspace_propose_grill_issues. One decision per frontier question — closed decisions use choices (label + description) and recommendedChoiceId; never embed A/B/C lists in prompt; open-ended questions omit choices and may use recommendation. Use read-only Colony Docs via workspace.list_docs and workspace.get_doc when they help ground the discussion. Call tools by the exact names in your tool list.`,
  },
  {
    id: "oneshot",
    applies: (context: AgentGrantContext | undefined) =>
      Boolean(context?.oneshotId),
    instructions: `You are running a Oneshot: a single bounded Task with one final output and no follow-up turns. Deliver the complete answer in your final response. Do not ask clarifying questions and wait; if information is missing, state assumptions and finish. You are not in a Room — workspace.room tools are unavailable.`,
  },
  {
    id: "chat",
    applies: (context: AgentGrantContext | undefined) =>
      Boolean(context?.chatId),
    instructions: `You are in a Chat: a private multi-turn conversation with one Account. Answer in your assistant text. Ask clarifying questions when they help. Follow-up turns will arrive in this same conversation. You are not in a Room — workspace.room tools are unavailable.`,
  },
  {
    id: "room",
    applies: (context: AgentGrantContext | undefined) =>
      Boolean(context?.roomId),
    instructions: `You are working from a Room. Use workspace.room tools to understand the shared discussion before acting. Use workspace.post_message only for useful progress updates or clarifying questions; deliver the final result in your final response. A Room task may be conversational and may not involve a code repository or failing test.`,
  },
] as const;

export function instructionsForInvocation(
  base: string,
  context?: AgentGrantContext,
): string {
  const role = invocationRoles.find((candidate) => candidate.applies(context));
  return role ? `${base}\n\n${role.instructions}` : base;
}
