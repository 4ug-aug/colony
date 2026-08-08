import type { McpUpstream } from "./gateway";

export type GrillQuestion = { id: string; prompt: string };

export type GrillFrontier = {
  questions: GrillQuestion[];
  drafts: Record<string, string>;
};

export interface WorkspaceGrillPort {
  setFrontier(
    questions: GrillQuestion[],
    drafts?: Record<string, string>,
  ): GrillFrontier;
}

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const asQuestions = (value: unknown): GrillQuestion[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const questions: GrillQuestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const { id, prompt } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id.trim()) return undefined;
    if (typeof prompt !== "string" || !prompt.trim()) return undefined;
    questions.push({ id: id.trim(), prompt: prompt.trim() });
  }
  return questions;
};

const asDrafts = (value: unknown): Record<string, string> | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const drafts: Record<string, string> = {};
  for (const [key, draft] of Object.entries(value as Record<string, unknown>)) {
    if (typeof draft !== "string") return undefined;
    drafts[key] = draft;
  }
  return drafts;
};

export function createWorkspaceGrillMcpUpstream(options: {
  port: WorkspaceGrillPort;
}): McpUpstream {
  return {
    async listTools() {
      return [
        {
          name: "workspace.set_grill_frontier",
          description:
            "Replace the current Grill frontier: the structured questions for this round, with optional agent-side draft framing keyed by question id.",
          inputSchema: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    prompt: { type: "string" },
                  },
                  required: ["id", "prompt"],
                },
              },
              drafts: {
                type: "object",
                additionalProperties: { type: "string" },
              },
            },
            required: ["questions"],
          },
        },
      ];
    },

    async callTool(name, args) {
      if (name === "workspace.set_grill_frontier") {
        const questions = asQuestions(args.questions);
        if (!questions) throw new Error("Invalid questions");
        const drafts = asDrafts(args.drafts);
        if (args.drafts !== undefined && drafts === undefined)
          throw new Error("Invalid drafts");
        return textResult(
          drafts === undefined
            ? options.port.setFrontier(questions)
            : options.port.setFrontier(questions, drafts),
        );
      }
      throw new Error(`Unknown workspace grill tool: ${name}`);
    },
  };
}
