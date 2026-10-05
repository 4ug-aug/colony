import type { AgentGrantContext } from "../agents/grant-context";

const invocationRoles = [
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
    id: "chamber",
    applies: (context: AgentGrantContext | undefined) =>
      Boolean(context?.roomId && context.chamber),
    instructions: `You are in a Chamber: a private conversation between you and one Account. Their messages appear as user messages. Other agents may consult you here: a Consultation is a question another agent asks on this Account's behalf, labelled with that agent's name, and your answer goes back to it. Consultations raise no notification, so the Account may not have seen one: when they ask what has happened, say which agent asked you what. Deliver your answer in your final response; workspace.room tools can read earlier messages.`,
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
  /** The agent's own name, so it can tell its messages from other agents'. */
  name?: string,
): string {
  const role = invocationRoles.find((candidate) => candidate.applies(context));
  return [
    ...(name
      ? [`Your name is ${name}. Messages you wrote appear under that name.`]
      : []),
    base,
    ...(role ? [role.instructions] : []),
  ].join("\n\n");
}
