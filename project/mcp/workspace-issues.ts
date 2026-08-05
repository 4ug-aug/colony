import type { McpUpstream } from "./gateway";

export type WorkspaceIssueStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done";
export type WorkspaceIssuePriority =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "urgent";
export type WorkspaceIssueOwner =
  | { kind: "account"; id: string }
  | { kind: "agent"; id: string };

export type WorkspaceIssue = {
  id: string;
  number: number;
  title: string;
  description: string;
  status: WorkspaceIssueStatus;
  priority: WorkspaceIssuePriority;
  tags: string[];
  timeSpent: number[];
  parentId?: string;
  owner?: WorkspaceIssueOwner;
  createdAt: number;
  updatedAt: number;
};

export interface WorkspaceIssuesPort {
  listIssues(filter?: { status?: WorkspaceIssueStatus }): WorkspaceIssue[];
  getIssue(ref: string): WorkspaceIssue | undefined;
  createIssue(input: {
    title: string;
    description?: string;
    status?: WorkspaceIssueStatus;
    priority?: WorkspaceIssuePriority;
    tags?: string[];
    parentId?: string;
    owner?: WorkspaceIssueOwner;
  }): WorkspaceIssue;
  updateIssue(
    ref: string,
    patch: Partial<{
      title: string;
      description: string;
      status: WorkspaceIssueStatus;
      priority: WorkspaceIssuePriority;
      tags: string[];
      timeSpent: number[];
      parentId: string | null;
    }>,
  ): WorkspaceIssue;
  assignIssue(ref: string, owner: WorkspaceIssueOwner | null): WorkspaceIssue;
}

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const asStatus = (value: unknown): WorkspaceIssueStatus | undefined => {
  if (
    value === "backlog" ||
    value === "todo" ||
    value === "in_progress" ||
    value === "in_review" ||
    value === "done"
  )
    return value;
  return undefined;
};

const asPriority = (value: unknown): WorkspaceIssuePriority | undefined => {
  if (
    value === "none" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "urgent"
  )
    return value;
  return undefined;
};

const asOwner = (value: unknown): WorkspaceIssueOwner | null | undefined => {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const owner = value as Record<string, unknown>;
  if (
    (owner.kind === "account" || owner.kind === "agent") &&
    typeof owner.id === "string" &&
    owner.id
  )
    return { kind: owner.kind, id: owner.id };
  return undefined;
};

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  if (value.some((item) => typeof item !== "string")) return undefined;
  return value as string[];
};

const asNumberArray = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  if (
    value.some((item) => typeof item !== "number" || !Number.isFinite(item))
  )
    return undefined;
  return value as number[];
};

export function createWorkspaceIssuesMcpUpstream(options: {
  port: WorkspaceIssuesPort;
}): McpUpstream {
  return {
    async listTools() {
      return [
        {
          name: "workspace.list_issues",
          description:
            "List Sweat workspace Issues. Optionally filter by status (backlog, todo, in_progress, in_review, done).",
          inputSchema: {
            type: "object",
            properties: { status: { type: "string" } },
          },
        },
        {
          name: "workspace.get_issue",
          description:
            "Get one Sweat Issue by id or display id (for example SWE-123).",
          inputSchema: {
            type: "object",
            properties: { ref: { type: "string" } },
            required: ["ref"],
          },
        },
        {
          name: "workspace.create_issue",
          description:
            "Create a Sweat Issue. Optional parentId nests it under a parent Issue.",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              status: { type: "string" },
              priority: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              parentId: { type: "string" },
              owner: { type: "object" },
            },
            required: ["title"],
          },
        },
        {
          name: "workspace.update_issue",
          description:
            "Update fields on a Sweat Issue (title, description, status, priority, tags, timeSpent, parentId).",
          inputSchema: {
            type: "object",
            properties: {
              ref: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              status: { type: "string" },
              priority: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              timeSpent: { type: "array", items: { type: "number" } },
              parentId: { type: ["string", "null"] },
            },
            required: ["ref"],
          },
        },
        {
          name: "workspace.assign_issue",
          description:
            "Set the Issue owner to an account or agent definition, or clear it with owner null.",
          inputSchema: {
            type: "object",
            properties: {
              ref: { type: "string" },
              owner: { type: ["object", "null"] },
            },
            required: ["ref", "owner"],
          },
        },
      ];
    },

    async callTool(name, args) {
      if (name === "workspace.list_issues") {
        const status = asStatus(args.status);
        if (args.status !== undefined && status === undefined)
          throw new Error("Invalid status");
        return textResult(
          options.port.listIssues(status ? { status } : undefined),
        );
      }
      if (name === "workspace.get_issue") {
        const ref = asString(args.ref)?.trim();
        if (!ref) throw new Error("A ref is required");
        const issue = options.port.getIssue(ref);
        if (!issue) throw new Error(`Issue not found: ${ref}`);
        return textResult(issue);
      }
      if (name === "workspace.create_issue") {
        const title = asString(args.title)?.trim();
        if (!title) throw new Error("A non-empty title is required");
        const status = asStatus(args.status);
        if (args.status !== undefined && status === undefined)
          throw new Error("Invalid status");
        const priority = asPriority(args.priority);
        if (args.priority !== undefined && priority === undefined)
          throw new Error("Invalid priority");
        const tags = asStringArray(args.tags);
        if (args.tags !== undefined && tags === undefined)
          throw new Error("Invalid tags");
        const owner = asOwner(args.owner);
        if (args.owner !== undefined && owner === undefined)
          throw new Error("Invalid owner");
        return textResult(
          options.port.createIssue({
            title,
            ...(asString(args.description) !== undefined
              ? { description: asString(args.description) }
              : {}),
            ...(status ? { status } : {}),
            ...(priority ? { priority } : {}),
            ...(tags ? { tags } : {}),
            ...(asString(args.parentId)
              ? { parentId: asString(args.parentId) }
              : {}),
            ...(owner ? { owner } : {}),
          }),
        );
      }
      if (name === "workspace.update_issue") {
        const ref = asString(args.ref)?.trim();
        if (!ref) throw new Error("A ref is required");
        const status = asStatus(args.status);
        if (args.status !== undefined && status === undefined)
          throw new Error("Invalid status");
        const priority = asPriority(args.priority);
        if (args.priority !== undefined && priority === undefined)
          throw new Error("Invalid priority");
        const tags = asStringArray(args.tags);
        if (args.tags !== undefined && tags === undefined)
          throw new Error("Invalid tags");
        const timeSpent = asNumberArray(args.timeSpent);
        if (args.timeSpent !== undefined && timeSpent === undefined)
          throw new Error("Invalid timeSpent");
        if (
          args.parentId !== undefined &&
          args.parentId !== null &&
          typeof args.parentId !== "string"
        )
          throw new Error("Invalid parentId");
        return textResult(
          options.port.updateIssue(ref, {
            ...(asString(args.title) !== undefined
              ? { title: asString(args.title)! }
              : {}),
            ...(asString(args.description) !== undefined
              ? { description: asString(args.description)! }
              : {}),
            ...(status ? { status } : {}),
            ...(priority ? { priority } : {}),
            ...(tags ? { tags } : {}),
            ...(timeSpent ? { timeSpent } : {}),
            ...(args.parentId !== undefined
              ? { parentId: args.parentId as string | null }
              : {}),
          }),
        );
      }
      if (name === "workspace.assign_issue") {
        const ref = asString(args.ref)?.trim();
        if (!ref) throw new Error("A ref is required");
        if (!("owner" in args)) throw new Error("owner is required");
        const owner = asOwner(args.owner);
        if (owner === undefined) throw new Error("Invalid owner");
        return textResult(options.port.assignIssue(ref, owner));
      }
      throw new Error(`Unknown workspace issues tool: ${name}`);
    },
  };
}
