import type { AgentGrantContext } from "../agents/grant-context";

const invocationRoles = [
  {
    id: "grill",
    applies: (context: AgentGrantContext | undefined) =>
      Boolean(context?.grillId),
    instructions: `You are leading a Grilling session. Use workspace.grill tools to drive the structured design conversation. Never ask Accounts questions in assistant text or via workspace.post_message: publish every open question with workspace.set_grill_frontier, or wrap up with workspace.propose_grill_writeup or workspace.propose_grill_issues. Use read-only Sweat Docs when they help ground the discussion.`,
  },
  {
    id: "room",
    applies: (context: AgentGrantContext | undefined) =>
      Boolean(context?.roomId),
    instructions: `You are working from a Room. Use workspace.room tools to understand the shared discussion before acting. Use workspace.post_message only for useful progress updates or clarifying questions; deliver the final result in your final response. A Room task may be conversational and may not involve a code repository or failing test.`,
  },
] as const;

export type AgentInvocationRole = (typeof invocationRoles)[number]["id"];

export function instructionsForInvocation(
  base: string,
  context?: AgentGrantContext,
): string {
  const role = invocationRoles.find((candidate) => candidate.applies(context));
  return role ? `${base}\n\n${role.instructions}` : base;
}
