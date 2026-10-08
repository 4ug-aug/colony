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
export type WorkspaceIssueActor =
  | { kind: "account"; id: string }
  | { kind: "agent"; id: string };

export type WorkspaceIssueOwner = WorkspaceIssueActor;

export type AssignableOwner = WorkspaceIssueOwner & {
  name: string;
  username?: string;
  email?: string;
};

export type WorkspaceIssueCreate = {
  title: string;
  description?: string;
  status?: WorkspaceIssueStatus;
  priority?: WorkspaceIssuePriority;
  tags?: string[];
  parentId?: string;
  owner?: WorkspaceIssueOwner;
};

export type WorkspaceIssue = {
  id: string;
  number: number;
  title: string;
  description: string;
  deliverable: string;
  status: WorkspaceIssueStatus;
  priority: WorkspaceIssuePriority;
  tags: string[];
  timeSpent: number[];
  parentId?: string;
  branch?: string;
  effectiveBranch?: string;
  owner?: WorkspaceIssueOwner;
  createdBy?: WorkspaceIssueActor;
  createdAt: number;
  updatedAt: number;
  hasActiveRun?: boolean;
  children?: WorkspaceIssueChild[];
};

export type WorkspaceIssueChild = {
  id: string;
  number: number;
  status: WorkspaceIssueStatus;
  deliverable: string;
  owner?: WorkspaceIssueOwner;
  hasActiveRun?: boolean;
};

export interface WorkspaceIssuesPort {
  listIssues(filter?: { status?: WorkspaceIssueStatus }): WorkspaceIssue[];
  getIssue(ref: string): WorkspaceIssue | undefined;
  createIssue(
    input: WorkspaceIssueCreate & { createdBy: WorkspaceIssueActor },
  ): WorkspaceIssue;
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
      branch: string | null;
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

const OWNER_SHAPE =
  '{ "kind": "agent" | "account", "id": "<id>" } or null. Example: { "kind": "agent", "id": "software-engineer" }';

const normalizeOwnerKey = (value: string): string =>
  value.trim().toLowerCase().replace(/[\s_-]+/g, "");

const ownerHint = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return undefined;
  const owner = value as Record<string, unknown>;
  for (const key of ["id", "name", "username", "label"] as const) {
    const candidate = owner[key];
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
  }
  return undefined;
};

const formatOwnerExample = (owner: AssignableOwner): string =>
  `{ "kind": "${owner.kind}", "id": "${owner.id}" }`;

const matchAssignableOwners = (
  hint: string | undefined,
  candidates: AssignableOwner[],
): AssignableOwner[] => {
  if (!hint) return [];
  const needle = normalizeOwnerKey(hint);
  if (!needle) return [];
  const exact = candidates.filter(
    (owner) =>
      normalizeOwnerKey(owner.id) === needle ||
      normalizeOwnerKey(owner.name) === needle,
  );
  if (exact.length) return exact;
  return candidates.filter(
    (owner) =>
      normalizeOwnerKey(owner.id).includes(needle) ||
      normalizeOwnerKey(owner.name).includes(needle) ||
      needle.includes(normalizeOwnerKey(owner.id)) ||
      needle.includes(normalizeOwnerKey(owner.name)),
  );
};

const formatKnownOwners = (candidates: AssignableOwner[]): string => {
  if (!candidates.length) return "";
  return ` Known owners: ${candidates
    .map(
      (owner) =>
        `${owner.kind} ${owner.id} (${owner.name}) → ${formatOwnerExample(owner)}`,
    )
    .join("; ")}.`;
};

function invalidOwnerMessage(
  received: unknown,
  candidates: AssignableOwner[] = [],
): string {
  const hint = ownerHint(received);
  const matches = matchAssignableOwners(hint, candidates);
  const receivedText = JSON.stringify(received);
  const suggestion = matches.length
    ? ` Did you mean: ${matches.map(formatOwnerExample).join(" or ")}?`
    : "";
  return `Invalid owner. Expected ${OWNER_SHAPE}. Received: ${receivedText}.${suggestion}${formatKnownOwners(candidates)}`;
}

function unknownOwnerMessage(
  owner: WorkspaceIssueOwner,
  candidates: AssignableOwner[],
): string {
  const matches = matchAssignableOwners(owner.id, candidates).filter(
    (candidate) =>
      !(candidate.kind === owner.kind && candidate.id === owner.id),
  );
  const knownOfKind = candidates.filter(
    (candidate) => candidate.kind === owner.kind,
  );
  const suggestion = matches.length
    ? ` Did you mean: ${matches.map(formatOwnerExample).join(" or ")}?`
    : "";
  return `Unknown ${owner.kind} "${owner.id}".${suggestion}${formatKnownOwners(knownOfKind.length ? knownOfKind : candidates)}`;
}

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

const ownerSchemaDescription =
  'Owner as { "kind": "agent" | "account", "id": "<id>" }, or null to clear. Use agent definition ids (e.g. "software-engineer"), not display names.';

export function createWorkspaceIssuesMcpUpstream(options: {
  port: Omit<WorkspaceIssuesPort, "createIssue"> & {
    createIssue(input: WorkspaceIssueCreate): WorkspaceIssue;
  };
  listAssignableOwners?: () => AssignableOwner[];
}): McpUpstream {
  const assignableOwners = () => options.listAssignableOwners?.() ?? [];
  const requireOwner = (value: unknown): WorkspaceIssueOwner | null => {
    const owner = asOwner(value);
    if (owner === undefined)
      throw new Error(invalidOwnerMessage(value, assignableOwners()));
    if (owner === null) return null;
    const known = assignableOwners();
    if (
      known.length &&
      !known.some(
        (candidate) =>
          candidate.kind === owner.kind && candidate.id === owner.id,
      )
    )
      throw new Error(unknownOwnerMessage(owner, known));
    return owner;
  };

  return {
    async listTools() {
      return [
        {
          name: "workspace.list_issues",
          description:
            "List Colony workspace Issues. Optionally filter by status (backlog, todo, in_progress, in_review, done).",
          inputSchema: {
            type: "object",
            properties: { status: { type: "string" } },
          },
        },
        {
          name: "workspace.get_issue",
          description:
            "Get one Colony Issue by id or display id (for example COL-123).",
          inputSchema: {
            type: "object",
            properties: { ref: { type: "string" } },
            required: ["ref"],
          },
        },
        {
          name: "workspace.create_issue",
          description:
            "Create a Colony Issue. Optional parentId nests it under a parent Issue.",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              status: { type: "string" },
              priority: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              parentId: { type: "string" },
              owner: {
                type: "object",
                description: ownerSchemaDescription,
              },
            },
            required: ["title"],
          },
        },
        {
          name: "workspace.update_issue",
          description:
            "Update fields on a Colony Issue (title, description, status, priority, tags, timeSpent, parentId, branch).",
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
              branch: { type: ["string", "null"] },
            },
            required: ["ref"],
          },
        },
        {
          name: "workspace.assign_issue",
          description:
            'Set the Issue owner to an account or agent definition ({ "kind": "agent"|"account", "id": "<id>" }), or clear it with owner null. Do not pass display names; use ids such as "software-engineer".',
          inputSchema: {
            type: "object",
            properties: {
              ref: { type: "string" },
              owner: {
                type: ["object", "null"],
                description: ownerSchemaDescription,
              },
            },
            required: ["ref", "owner"],
          },
        },
        {
          name: "workspace.list_people",
          description:
            "List the people (accounts) in the Colony workspace with name, username, email, and account id. Use it to find a colleague by name, initials, or email; use workspace.list_agents for agents.",
          inputSchema: { type: "object", properties: {} },
        },
      ];
    },

    async callTool(name, args) {
      if (name === "workspace.list_people") {
        const people = assignableOwners().filter(
          (owner) => owner.kind === "account",
        );
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `${people.length} people in the Colony workspace. Assign an Issue to one with owner { "kind": "account", "id": "<id>" }.`,
                "",
                ...people.map((person) =>
                  [
                    `- ${person.name}`,
                    person.username && `@${person.username}`,
                    person.email,
                    `id ${person.id}`,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                ),
              ].join("\n"),
            },
          ],
        };
      }
      if (name === "workspace.list_issues") {
        const status = asStatus(args.status);
        if (args.status !== undefined && status === undefined)
          throw new Error("Invalid status");
        const issues = options.port.listIssues(status ? { status } : undefined);
        // One line each: full descriptions and deliverables filled small models' context.
        const line = (issue: WorkspaceIssue) =>
          [
            `- COL-${issue.number} ${issue.title}`,
            issue.status,
            issue.priority !== "none" && issue.priority,
            issue.owner ? `${issue.owner.kind} ${issue.owner.id}` : "unassigned",
            issue.parentId && `parent ${issue.parentId}`,
            ...issue.tags.map((tag) => `#${tag}`),
            issue.hasActiveRun && "running",
            issue.deliverable.trim() && "has deliverable",
          ]
            .filter(Boolean)
            .join(" · ");
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `${issues.length} Issues. Pass a ref to workspace.get_issue for the description, deliverable, and children.`,
                "",
                ...issues.map(line),
              ].join("\n"),
            },
          ],
        };
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
        const owner =
          args.owner === undefined ? undefined : requireOwner(args.owner);
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
        if (
          args.branch !== undefined &&
          args.branch !== null &&
          typeof args.branch !== "string"
        )
          throw new Error("Invalid branch");
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
            ...(args.branch !== undefined
              ? { branch: args.branch as string | null }
              : {}),
          }),
        );
      }
      if (name === "workspace.assign_issue") {
        const ref = asString(args.ref)?.trim();
        if (!ref) throw new Error("A ref is required");
        if (!("owner" in args)) throw new Error("owner is required");
        const owner = requireOwner(args.owner);
        return textResult(options.port.assignIssue(ref, owner));
      }
      throw new Error(`Unknown workspace issues tool: ${name}`);
    },
  };
}
