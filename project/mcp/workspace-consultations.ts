import type { McpUpstream } from "./gateway";

export type Consultation = {
  askingAgentId: string;
  askingRunId: string;
  agentDefinitionId: string;
  question: string;
};

export type AskableAgent = { id: string; name: string; description: string };

export interface WorkspaceConsultationsPort {
  /** Resolves with the consulted agent's answer, or a note on why there is none. */
  ask(consultation: Consultation): Promise<string>;
  /** Agents the account may consult: visible to it and not archived. */
  askableAgents(accountId: string): AskableAgent[];
}

export function createWorkspaceConsultationsMcpUpstream(options: {
  port: WorkspaceConsultationsPort;
  askingAgentId: string;
  askingRunId: string;
  accountId: string;
}): McpUpstream {
  const askable = () =>
    options.port
      .askableAgents(options.accountId)
      .filter(({ id }) => id !== options.askingAgentId);
  return {
    async listTools() {
      // Named here so finding a specialist needs no other tool.
      const agents = askable();
      return [
        {
          name: "workspace.ask_agent",
          description: [
            "Ask another agent a question and wait for its answer. The question and answer appear in the user's Chamber with that agent, which works with its own tools. Use it when another agent is the specialist.",
            "Agents you can ask:",
            ...agents.map(
              ({ id, name, description }) => `- ${id} (${name}): ${description}`,
            ),
          ].join("\n"),
          inputSchema: {
            type: "object",
            properties: {
              agentDefinitionId: {
                type: "string",
                enum: agents.map(({ id }) => id),
                description: "Agent id (slug) to ask.",
              },
              question: {
                type: "string",
                description:
                  "A self-contained question: the agent sees its own Chamber, not this conversation.",
              },
            },
            required: ["agentDefinitionId", "question"],
          },
        },
      ];
    },
    async callTool(name, args) {
      if (name !== "workspace.ask_agent")
        throw new Error(`Unknown tool: ${name}`);
      const agentDefinitionId =
        typeof args.agentDefinitionId === "string"
          ? args.agentDefinitionId.trim()
          : "";
      const question =
        typeof args.question === "string" ? args.question.trim() : "";
      if (!agentDefinitionId) throw new Error("agentDefinitionId is required");
      if (!question) throw new Error("A non-empty question is required");
      if (!askable().some(({ id }) => id === agentDefinitionId))
        throw new Error(`Unknown agent: ${agentDefinitionId}`);
      const answer = await options.port.ask({
        askingAgentId: options.askingAgentId,
        askingRunId: options.askingRunId,
        agentDefinitionId,
        question,
      });
      return { content: [{ type: "text", text: answer }] };
    },
  };
}
