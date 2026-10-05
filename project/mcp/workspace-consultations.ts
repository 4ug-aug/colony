import type { McpUpstream } from "./gateway";

export type Consultation = {
  askingAgentId: string;
  askingRunId: string;
  agentDefinitionId: string;
  question: string;
};

export interface WorkspaceConsultationsPort {
  /** Resolves with the consulted agent's answer, or a note on why there is none. */
  ask(consultation: Consultation): Promise<string>;
}

export function createWorkspaceConsultationsMcpUpstream(options: {
  port: WorkspaceConsultationsPort;
  askingAgentId: string;
  askingRunId: string;
}): McpUpstream {
  return {
    async listTools() {
      return [
        {
          name: "workspace.ask_agent",
          description:
            "Ask another agent a question and wait for its answer. The question and answer appear in the user's Chamber with that agent, which works with its own tools. Use it when another agent is the specialist; use workspace.list_agents to find one.",
          inputSchema: {
            type: "object",
            properties: {
              agentDefinitionId: {
                type: "string",
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
