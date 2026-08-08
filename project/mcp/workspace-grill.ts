import type { McpUpstream } from "./gateway";

export type GrillQuestion = {
  id: string;
  prompt: string;
  recommendation?: string;
};

export type GrillFrontier = {
  questions: GrillQuestion[];
  drafts: Record<string, string>;
};

export type GrillProposedIssue = {
  key: string;
  title: string;
  description?: string;
  parentKey?: string;
};

export type GrillIssueProposal = {
  status: "proposed" | "revision_requested" | "confirmed";
  issues: GrillProposedIssue[];
  revisionNotes?: string;
};

export interface WorkspaceGrillPort {
  setFrontier(
    questions: GrillQuestion[],
    drafts?: Record<string, string>,
  ): GrillFrontier;
  proposeIssues(issues: GrillProposedIssue[]): GrillIssueProposal;
}

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const asQuestions = (value: unknown): GrillQuestion[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const questions: GrillQuestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const { id, prompt, recommendation } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id.trim()) return undefined;
    if (typeof prompt !== "string" || !prompt.trim()) return undefined;
    if (
      recommendation !== undefined &&
      (typeof recommendation !== "string" || !recommendation.trim())
    )
      return undefined;
    questions.push({
      id: id.trim(),
      prompt: prompt.trim(),
      ...(recommendation !== undefined
        ? { recommendation: recommendation.trim() }
        : {}),
    });
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

const asProposedIssues = (
  value: unknown,
): GrillProposedIssue[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const issues: GrillProposedIssue[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const { key, title, description, parentKey } = item as Record<
      string,
      unknown
    >;
    if (typeof key !== "string" || !key.trim()) return undefined;
    if (typeof title !== "string" || !title.trim()) return undefined;
    if (description !== undefined && typeof description !== "string")
      return undefined;
    if (parentKey !== undefined && typeof parentKey !== "string")
      return undefined;
    issues.push({
      key: key.trim(),
      title: title.trim(),
      ...(description !== undefined ? { description } : {}),
      ...(typeof parentKey === "string" && parentKey.trim()
        ? { parentKey: parentKey.trim() }
        : {}),
    });
  }
  return issues;
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
            "Replace the current Grill frontier: structured questions for this round. Put framing in each question prompt. Put the suggested answer in recommendation (Accounts can one-click accept it). Leave drafts empty — Accounts fill those in the UI.",
          inputSchema: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    prompt: {
                      type: "string",
                      description:
                        "Question and framing only — do not embed the recommended answer here",
                    },
                    recommendation: {
                      type: "string",
                      description:
                        "Optional suggested answer Accounts can accept with one click",
                    },
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
        {
          name: "workspace.propose_grill_issues",
          description:
            "Publish or revise the Grill wrap-up Issue tree proposal (title, description, parent/child via parentKey). Accounts must confirm before Issues are created; do not invent owners.",
          inputSchema: {
            type: "object",
            properties: {
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    key: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    parentKey: { type: "string" },
                  },
                  required: ["key", "title"],
                },
              },
            },
            required: ["issues"],
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
      if (name === "workspace.propose_grill_issues") {
        const issues = asProposedIssues(args.issues);
        if (!issues) throw new Error("Invalid issues");
        return textResult(options.port.proposeIssues(issues));
      }
      throw new Error(`Unknown workspace grill tool: ${name}`);
    },
  };
}
