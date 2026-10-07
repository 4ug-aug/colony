import type { McpTool, McpUpstream } from "./gateway";

const asanaUrl = "https://app.asana.com/api/1.0";
const outOfScope = "Asana task is outside the configured project";

const tools: readonly McpTool[] = [
  {
    name: "asana.get_project",
    description: "Read the configured Asana project.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "asana.create_task",
    description: "Create a task in the configured Asana project.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
        description: { type: "string", minLength: 1 },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "asana.list_tasks",
    description:
      "List tasks in the configured Asana project: open ones unless includeCompleted. Each line shows section, assignee, due date, tags, and the task id; pass the offset the result names for more.",
    inputSchema: {
      type: "object",
      properties: {
        includeCompleted: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "asana.get_task",
    description: "Read a task in the configured Asana project.",
    inputSchema: {
      type: "object",
      properties: { taskGid: { type: "string", minLength: 1 } },
      required: ["taskGid"],
      additionalProperties: false,
    },
  },
  {
    name: "asana.get_task_comments",
    description: "Read comments on a task in the configured Asana project.",
    inputSchema: {
      type: "object",
      properties: { taskGid: { type: "string", minLength: 1 } },
      required: ["taskGid"],
      additionalProperties: false,
    },
  },
  {
    name: "asana.set_task_completion",
    description:
      "Set whether a task in the configured Asana project is complete.",
    inputSchema: {
      type: "object",
      properties: {
        taskGid: { type: "string", minLength: 1 },
        completed: { type: "boolean" },
      },
      required: ["taskGid", "completed"],
      additionalProperties: false,
    },
  },
  {
    name: "asana.list_users",
    description:
      "List the members of the configured Asana project with their name, email, and id. Use it to find a colleague (by name, initials, or email) before asana.assign_task; Colony agents are not Asana users.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "asana.assign_task",
    description:
      "Assign a task in the configured Asana project to one of its members, by the id or email from asana.list_users. Pass null to unassign.",
    inputSchema: {
      type: "object",
      properties: {
        taskGid: { type: "string", minLength: 1 },
        assignee: { type: ["string", "null"] },
      },
      required: ["taskGid", "assignee"],
      additionalProperties: false,
    },
  },
  {
    name: "asana.add_task_comment",
    description: "Add a comment to a task in the configured Asana project.",
    inputSchema: {
      type: "object",
      properties: {
        taskGid: { type: "string", minLength: 1 },
        text: { type: "string", minLength: 1 },
      },
      required: ["taskGid", "text"],
      additionalProperties: false,
    },
  },
];

type AsanaResponse = { data: unknown; next_page?: unknown };
type TaskInput = { taskGid: string };
type AsanaTask = {
  gid: string;
  name: string;
  completed?: boolean;
  notes?: string;
  assignee?: { name?: string } | null;
  due_on?: string | null;
  tags?: { name?: string }[];
  memberships?: { project?: { gid?: string }; section?: { name?: string } }[];
  created_at?: string;
  modified_at?: string;
  permalink_url?: string;
};
type AsanaUser = { gid: string; name?: string; email?: string };
type AsanaStory = {
  text?: string;
  resource_subtype?: string;
  created_by?: { name?: string } | null;
  created_at?: string;
};

const LIST_FIELDS =
  "gid,name,completed,assignee.name,due_on,tags.name,memberships.project.gid,memberships.section.name";
const TASK_FIELDS = `gid,name,notes,completed,assignee.name,due_on,tags.name,memberships.project.gid,memberships.section.name,created_at,modified_at,permalink_url`;

// Models read results as text: Asana's raw JSON is mostly ids, URLs, and cursors.
const text = (value: string) => ({
  content: [{ type: "text" as const, text: value }],
});
const day = (iso?: string) => iso?.slice(0, 10);

function sectionIn(task: AsanaTask, projectGid: string): string | undefined {
  return task.memberships?.find(({ project }) => project?.gid === projectGid)
    ?.section?.name;
}

function taskLine(task: AsanaTask, projectGid: string): string {
  const tags = (task.tags ?? []).flatMap(({ name }) =>
    name ? [`#${name}`] : [],
  );
  return [
    `- ${task.completed ? "[done] " : ""}${task.name}`,
    sectionIn(task, projectGid),
    task.assignee?.name ?? "unassigned",
    task.due_on && `due ${task.due_on}`,
    ...tags,
    `id ${task.gid}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function taskDetails(task: AsanaTask, projectGid: string): string {
  const facts = [
    sectionIn(task, projectGid) && `Section: ${sectionIn(task, projectGid)}`,
    `Assignee: ${task.assignee?.name ?? "unassigned"}`,
    task.due_on && `Due: ${task.due_on}`,
    task.tags?.length &&
      `Tags: ${task.tags.flatMap(({ name }) => name ?? []).join(", ")}`,
  ].filter(Boolean);
  const dates = [
    task.created_at && `Created ${day(task.created_at)}`,
    task.modified_at && `Modified ${day(task.modified_at)}`,
  ].filter(Boolean);
  return [
    `${task.name} (${task.completed ? "done" : "open"})`,
    `Id: ${task.gid}`,
    facts.join(" · "),
    ...(dates.length ? [dates.join(" · ")] : []),
    ...(task.permalink_url ? [`Link: ${task.permalink_url}`] : []),
    ...(task.notes?.trim() ? ["", task.notes.trim()] : []),
  ].join("\n");
}

function requireOnly(
  args: Record<string, unknown>,
  keys: readonly string[],
): void {
  if (Object.keys(args).some((key) => !keys.includes(key)))
    throw new Error("Invalid Asana tool arguments");
}

function nonEmptyString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value;
}

function taskInput(args: Record<string, unknown>): TaskInput {
  requireOnly(args, ["taskGid"]);
  return { taskGid: nonEmptyString(args.taskGid, "Asana taskGid is required") };
}

function createTaskInput(args: Record<string, unknown>): {
  name: string;
  description?: string;
} {
  requireOnly(args, ["name", "description"]);
  return {
    name: nonEmptyString(args.name, "Asana task name is required"),
    ...(args.description === undefined
      ? {}
      : {
          description: nonEmptyString(
            args.description,
            "Asana task description must be a non-empty string",
          ),
        }),
  };
}

function listTasksInput(args: Record<string, unknown>): {
  includeCompleted: boolean;
  limit: number;
  offset?: string;
} {
  requireOnly(args, ["includeCompleted", "limit", "offset"]);
  if (
    args.includeCompleted !== undefined &&
    typeof args.includeCompleted !== "boolean"
  )
    throw new Error("Asana includeCompleted must be a boolean");
  if (
    args.limit !== undefined &&
    (!Number.isInteger(args.limit) ||
      (args.limit as number) < 1 ||
      (args.limit as number) > 100)
  )
    throw new Error("Asana limit must be an integer from 1 to 100");
  return {
    includeCompleted: args.includeCompleted === true,
    limit: (args.limit as number | undefined) ?? 50,
    ...(args.offset === undefined
      ? {}
      : {
          offset: nonEmptyString(
            args.offset,
            "Asana offset must be a non-empty string",
          ),
        }),
  };
}

function completionInput(
  args: Record<string, unknown>,
): TaskInput & { completed: boolean } {
  requireOnly(args, ["taskGid", "completed"]);
  if (typeof args.completed !== "boolean")
    throw new Error("Asana completed must be a boolean");
  return {
    taskGid: nonEmptyString(args.taskGid, "Asana taskGid is required"),
    completed: args.completed,
  };
}

function assignInput(
  args: Record<string, unknown>,
): TaskInput & { assignee: string | null } {
  requireOnly(args, ["taskGid", "assignee"]);
  if (args.assignee !== null && (typeof args.assignee !== "string" || !args.assignee.trim()))
    throw new Error("Asana assignee must be a user id, an email, or null");
  return {
    taskGid: nonEmptyString(args.taskGid, "Asana taskGid is required"),
    assignee: args.assignee === null ? null : args.assignee.trim(),
  };
}

function commentInput(
  args: Record<string, unknown>,
): TaskInput & { text: string } {
  requireOnly(args, ["taskGid", "text"]);
  return {
    taskGid: nonEmptyString(args.taskGid, "Asana taskGid is required"),
    text: nonEmptyString(args.text, "Asana comment text is required"),
  };
}

function isProjectMember(value: unknown, projectGid: string): boolean {
  if (!value || typeof value !== "object" || !("memberships" in value))
    return false;
  const memberships = (value as { memberships?: unknown }).memberships;
  return (
    Array.isArray(memberships) &&
    memberships.some((membership) => {
      if (
        !membership ||
        typeof membership !== "object" ||
        !("project" in membership)
      )
        return false;
      const project = (membership as { project?: unknown }).project;
      return Boolean(
        project &&
        typeof project === "object" &&
        (project as { gid?: unknown }).gid === projectGid,
      );
    })
  );
}

export function readAsanaConfiguration(
  environment: Record<string, string | undefined> = process.env,
): { apiToken: string; projectGid: string } | undefined {
  const apiToken = environment.ASANA_API_TOKEN || undefined;
  const projectGid = environment.ASANA_PROJECT_GID || undefined;
  if (Boolean(apiToken) !== Boolean(projectGid))
    throw new Error(
      "ASANA_API_TOKEN and ASANA_PROJECT_GID must be configured together",
    );
  return apiToken && projectGid ? { apiToken, projectGid } : undefined;
}

export function createAsanaMcpUpstream(options: {
  apiToken: string;
  projectGid: string;
  fetch?: typeof fetch;
  now?: () => Date;
}): McpUpstream {
  const request = async (
    path: string,
    init?: RequestInit,
  ): Promise<AsanaResponse> => {
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(`${asanaUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${options.apiToken}`,
          ...init?.headers,
        },
      });
    } catch {
      throw new Error("Asana request failed");
    }
    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        throw new Error(
          `Asana rate limit exceeded${retryAfter ? `; retry after ${retryAfter} seconds` : ""}`,
        );
      }
      if (response.status === 401 || response.status === 403)
        throw new Error("Asana access was denied");
      if (response.status === 404)
        throw new Error("Asana resource was not found");
      throw new Error(`Asana request failed (${response.status})`);
    }
    try {
      return (await response.json()) as AsanaResponse;
    } catch {
      throw new Error("Asana returned an invalid response");
    }
  };
  const taskPath = (taskGid: string) => `/tasks/${encodeURIComponent(taskGid)}`;
  const ensureTaskInProject = async (taskGid: string): Promise<void> => {
    try {
      const response = await request(
        `${taskPath(taskGid)}?opt_fields=memberships.project.gid`,
      );
      if (isProjectMember(response.data, options.projectGid)) return;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Asana rate limit exceeded")
      )
        throw error;
    }
    throw new Error(outOfScope);
  };
  // The token is personal and sees the whole Asana workspace; people stay limited to the project.
  const projectMembers = async (): Promise<AsanaUser[]> => {
    const response = await request(
      `/projects/${encodeURIComponent(options.projectGid)}?${new URLSearchParams({ opt_fields: "members.name,members.email" })}`,
    );
    const members = (response.data as { members?: unknown })?.members;
    return (Array.isArray(members) ? members : []) as AsanaUser[];
  };

  return {
    listTools: async () => tools,
    async callTool(name, args) {
      if (name === "asana.get_project") {
        requireOnly(args, []);
        return request(
          `/projects/${encodeURIComponent(options.projectGid)}?opt_fields=gid,name,permalink_url`,
        );
      }
      if (name === "asana.create_task") {
        const input = createTaskInput(args);
        const created = await request(
          "/tasks?opt_fields=gid,name,permalink_url",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: {
                name: input.name,
                ...(input.description === undefined
                  ? {}
                  : { notes: input.description }),
                projects: [options.projectGid],
              },
            }),
          },
        );
        const task = created.data as AsanaTask;
        return text(
          `Created "${task.name}" (id ${task.gid})${task.permalink_url ? `: ${task.permalink_url}` : "."}`,
        );
      }
      if (name === "asana.list_tasks") {
        const input = listTasksInput(args);
        const query = new URLSearchParams({
          limit: String(input.limit),
          opt_fields: LIST_FIELDS,
          // Asana returns every task without completed_since; "now" keeps only open ones.
          completed_since: input.includeCompleted
            ? "1970-01-01T00:00:00.000Z"
            : (options.now?.() ?? new Date()).toISOString(),
        });
        if (input.offset) query.set("offset", input.offset);
        const response = await request(
          `/projects/${encodeURIComponent(options.projectGid)}/tasks?${query}`,
        );
        const tasks = (
          Array.isArray(response.data) ? response.data : []
        ) as AsanaTask[];
        const kind = input.includeCompleted ? "tasks" : "open tasks";
        if (!tasks.length) return text(`No ${kind} in the project.`);
        const next = (response.next_page as { offset?: string } | null)?.offset;
        return text(
          [
            `${tasks.length} ${kind} in the project. Pass a task's id to asana.get_task for details.`,
            "",
            ...tasks.map((task) => taskLine(task, options.projectGid)),
            ...(next
              ? ["", `More tasks: call asana.list_tasks with offset "${next}".`]
              : []),
          ].join("\n"),
        );
      }
      if (name === "asana.get_task") {
        const input = taskInput(args);
        await ensureTaskInProject(input.taskGid);
        const response = await request(
          `${taskPath(input.taskGid)}?opt_fields=${TASK_FIELDS}`,
        );
        return text(
          taskDetails(response.data as AsanaTask, options.projectGid),
        );
      }
      if (name === "asana.get_task_comments") {
        const input = taskInput(args);
        await ensureTaskInProject(input.taskGid);
        const response = await request(
          `${taskPath(input.taskGid)}/stories?opt_fields=gid,text,created_by.name,resource_subtype,created_at`,
        );
        const comments = (
          (Array.isArray(response.data) ? response.data : []) as AsanaStory[]
        ).filter((story) => story?.resource_subtype === "comment_added");
        return text(
          comments.length
            ? comments
                .map(
                  (comment) =>
                    `- ${comment.created_by?.name ?? "Someone"} (${day(comment.created_at)}): ${comment.text ?? ""}`,
                )
                .join("\n")
            : "No comments on this task.",
        );
      }
      if (name === "asana.set_task_completion") {
        const input = completionInput(args);
        await ensureTaskInProject(input.taskGid);
        await request(taskPath(input.taskGid), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { completed: input.completed } }),
        });
        return text(
          `Marked task ${input.taskGid} ${input.completed ? "complete" : "incomplete"}.`,
        );
      }
      if (name === "asana.list_users") {
        requireOnly(args, []);
        const users = await projectMembers();
        if (!users.length) return text("The Asana project has no members.");
        return text(
          [
            `${users.length} members of the Asana project. Pass an id or email to asana.assign_task.`,
            "",
            ...users.map((user) =>
              [`- ${user.name ?? "Unnamed"}`, user.email, `id ${user.gid}`].filter(Boolean).join(" · "),
            ),
          ].join("\n"),
        );
      }
      if (name === "asana.assign_task") {
        const input = assignInput(args);
        await ensureTaskInProject(input.taskGid);
        let assignee: string | null = null;
        if (input.assignee !== null) {
          const wanted = input.assignee.toLowerCase();
          const member = (await projectMembers()).find(
            (user) => user.gid === input.assignee || user.email?.toLowerCase() === wanted,
          );
          if (!member)
            throw new Error(
              `${input.assignee} is not a member of the Asana project; use asana.list_users`,
            );
          assignee = member.gid;
        }
        const response = await request(`${taskPath(input.taskGid)}?opt_fields=assignee.name`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { assignee } }),
        });
        const name = (response.data as AsanaTask).assignee?.name;
        return text(
          assignee === null
            ? `Unassigned task ${input.taskGid}.`
            : `Assigned task ${input.taskGid} to ${name ?? input.assignee}.`,
        );
      }
      if (name === "asana.add_task_comment") {
        const input = commentInput(args);
        await ensureTaskInProject(input.taskGid);
        await request(`${taskPath(input.taskGid)}/stories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { text: input.text } }),
        });
        return text(`Commented on task ${input.taskGid}.`);
      }
      throw new Error(`Unknown Asana tool: ${name}`);
    },
  };
}
