import type { McpUpstream } from "./gateway";

export type GrillChoice = {
  id: string;
  label: string;
  description?: string;
};

export type GrillQuestion = {
  id: string;
  prompt: string;
  choices?: GrillChoice[];
  recommendedChoiceId?: string;
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

export type GrillMaterializeFile = {
  path: string;
  content: string;
};

export type GrillIssueProposal = {
  status: "proposed" | "revision_requested" | "confirmed" | "dismissed";
  issues: GrillProposedIssue[];
  files?: GrillMaterializeFile[];
  revisionNotes?: string;
};

export type GrillWriteupProposal = {
  title: string;
  body: string;
};

export interface WorkspaceGrillPort {
  setFrontier(
    questions: GrillQuestion[],
    drafts?: Record<string, string>,
  ): GrillFrontier;
  proposeIssues(
    issues: GrillProposedIssue[],
    files?: GrillMaterializeFile[],
  ): GrillIssueProposal;
  proposeWriteup(writeup: GrillWriteupProposal): GrillWriteupProposal;
}

/** Appended to Grill-linked run turns so the agent cannot stall on chat questions. */
export const GRILL_TURN_CONTRACT = [
  "HARD RULE — Grill questions are tools, never chat:",
  "- Never ask Accounts a question in assistant text, narration, or workspace.post_message.",
  "- Every question for Accounts MUST go through workspace.set_grill_frontier before you end the turn (leave drafts empty).",
  "- One decision per question. Closed decisions use choices (short label + rationale in description) and recommendedChoiceId; never embed A/B/C lists in prompt.",
  "- Open-ended questions omit choices and may use recommendation for a suggested freeform answer.",
  "- Chat questions are the wrong path: Accounts can reply when the frontier is empty, but structured frontier cards are still required for multiplayer rounds.",
  "- The topic is the task above — do not ask what to grill; publish the first frontier from that topic.",
  "- Granted workspace tools are the three Grill tools plus read-only workspace.list_docs / workspace.get_doc when available — do not look for Issues, GitHub, or room tools.",
  "- Code Grill wrap-up MUST include its markdown design artifacts in workspace.propose_grill_issues files; General Grill omits files.",
  "- When the design tree is settled: General Grill → workspace.propose_grill_writeup; Issue breakdown → workspace.propose_grill_issues. Prefer wrap-up over inventing more questions.",
].join("\n");

const SET_GRILL_FRONTIER_DESCRIPTION =
  "REQUIRED for asking Accounts anything. Publishes structured frontier cards Accounts answer in the UI. Never ask questions in chat or assistant text — those are invisible and stall the Grill. One decision per question: put framing in prompt (never A/B/C lists); for closed decisions supply choices with short label + rationale in description and optional recommendedChoiceId; for open-ended omit choices and optionally set recommendation. Leave drafts empty. Only ask what is still open; when nothing important remains, call a wrap-up tool instead.";

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const asChoices = (value: unknown): GrillChoice[] | undefined => {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const choices: GrillChoice[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const { id, label, description } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id.trim()) return undefined;
    if (typeof label !== "string" || !label.trim()) return undefined;
    if (description !== undefined && typeof description !== "string")
      return undefined;
    const trimmedId = id.trim();
    if (trimmedId === "__grill_other__") return undefined;
    if (seen.has(trimmedId)) return undefined;
    seen.add(trimmedId);
    choices.push({
      id: trimmedId,
      label: label.trim(),
      ...(description !== undefined && description.trim()
        ? { description: description.trim() }
        : {}),
    });
  }
  return choices;
};

const asQuestions = (value: unknown): GrillQuestion[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const questions: GrillQuestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const { id, prompt, recommendation, choices, recommendedChoiceId } =
      item as Record<string, unknown>;
    if (typeof id !== "string" || !id.trim()) return undefined;
    if (typeof prompt !== "string" || !prompt.trim()) return undefined;

    const parsedChoices =
      choices === undefined ? undefined : asChoices(choices);
    if (choices !== undefined && !parsedChoices) return undefined;

    if (parsedChoices) {
      if (recommendation !== undefined) return undefined;
      if (recommendedChoiceId !== undefined) {
        if (
          typeof recommendedChoiceId !== "string" ||
          !recommendedChoiceId.trim()
        )
          return undefined;
        const recommended = recommendedChoiceId.trim();
        if (!parsedChoices.some((choice) => choice.id === recommended))
          return undefined;
      }
      questions.push({
        id: id.trim(),
        prompt: prompt.trim(),
        choices: parsedChoices,
        ...(recommendedChoiceId !== undefined
          ? { recommendedChoiceId: (recommendedChoiceId as string).trim() }
          : {}),
      });
      continue;
    }

    if (recommendedChoiceId !== undefined) return undefined;
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

const asMaterializeFiles = (
  value: unknown,
): GrillMaterializeFile[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const files: GrillMaterializeFile[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const { path, content } = item as Record<string, unknown>;
    if (typeof path !== "string" || !path.trim()) return undefined;
    if (typeof content !== "string") return undefined;
    files.push({ path: path.trim(), content });
  }
  return files;
};

const asWriteup = (value: unknown): GrillWriteupProposal | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const { title, body } = value as Record<string, unknown>;
  if (typeof title !== "string" || !title.trim()) return undefined;
  if (typeof body !== "string") return undefined;
  return { title: title.trim(), body };
};

export function createWorkspaceGrillMcpUpstream(options: {
  port: WorkspaceGrillPort;
}): McpUpstream {
  return {
    async listTools() {
      return [
        {
          name: "workspace.set_grill_frontier",
          description: SET_GRILL_FRONTIER_DESCRIPTION,
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
                        "Question and framing only — never embed A/B/C option lists or the recommended answer",
                    },
                    choices: {
                      type: "array",
                      description:
                        "Closed decision options (≥2). Put short titles in label and background/tradeoffs in description.",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          label: { type: "string" },
                          description: { type: "string" },
                        },
                        required: ["id", "label"],
                      },
                    },
                    recommendedChoiceId: {
                      type: "string",
                      description:
                        "Optional preferred choice id when choices are present",
                    },
                    recommendation: {
                      type: "string",
                      description:
                        "Optional suggested freeform answer when choices are omitted",
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
            "Wrap-up: publish or revise the Grill Issue tree proposal (title, description, parent/child via parentKey). For Code Grills, files is required and contains the complete markdown design artifacts to publish on the session branch. General Grills omit files. Accounts must confirm before Issues are created; do not invent owners.",
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
              files: {
                type: "array",
                description:
                  "Code Grill only: complete markdown design artifacts for the session branch",
                items: {
                  type: "object",
                  properties: {
                    path: { type: "string" },
                    content: { type: "string" },
                  },
                  required: ["path", "content"],
                },
              },
            },
            required: ["issues"],
          },
        },
        {
          name: "workspace.propose_grill_writeup",
          description:
            "Wrap-up for General Grill: publish the lasting freeform markdown Doc writeup (title + body). Accounts complete the Grill to persist it as a workspace Doc. Prefer this over more frontier questions once decisions are settled.",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string" },
              body: {
                type: "string",
                description: "Freeform markdown writeup",
              },
            },
            required: ["title", "body"],
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
        const files = asMaterializeFiles(args.files);
        if (args.files !== undefined && !files)
          throw new Error("Invalid materialize files");
        return textResult(options.port.proposeIssues(issues, files));
      }
      if (name === "workspace.propose_grill_writeup") {
        const writeup = asWriteup(args);
        if (!writeup) throw new Error("Invalid writeup");
        return textResult(options.port.proposeWriteup(writeup));
      }
      throw new Error(`Unknown workspace grill tool: ${name}`);
    },
  };
}
