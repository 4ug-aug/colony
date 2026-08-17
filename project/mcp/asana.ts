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
      "List tasks in the configured Asana project. Use nextPage.offset for the next bounded page.",
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
        return request("/tasks?opt_fields=gid,name,permalink_url", {
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
        });
      }
      if (name === "asana.list_tasks") {
        const input = listTasksInput(args);
        const query = new URLSearchParams({
          limit: String(input.limit),
          opt_fields: "gid,name,completed,permalink_url",
        });
        if (input.includeCompleted)
          query.set("completed_since", "1970-01-01T00:00:00.000Z");
        if (input.offset) query.set("offset", input.offset);
        return request(
          `/projects/${encodeURIComponent(options.projectGid)}/tasks?${query}`,
        );
      }
      if (name === "asana.get_task") {
        const input = taskInput(args);
        await ensureTaskInProject(input.taskGid);
        return request(
          `${taskPath(input.taskGid)}?opt_fields=gid,name,notes,completed,permalink_url`,
        );
      }
      if (name === "asana.get_task_comments") {
        const input = taskInput(args);
        await ensureTaskInProject(input.taskGid);
        const response = await request(
          `${taskPath(input.taskGid)}/stories?opt_fields=gid,text,created_by.name,resource_subtype,created_at`,
        );
        const stories = Array.isArray(response.data) ? response.data : [];
        return {
          data: stories.filter(
            (story) =>
              story &&
              typeof story === "object" &&
              (story as { resource_subtype?: unknown }).resource_subtype ===
                "comment_added",
          ),
        };
      }
      if (name === "asana.set_task_completion") {
        const input = completionInput(args);
        await ensureTaskInProject(input.taskGid);
        return request(taskPath(input.taskGid), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { completed: input.completed } }),
        });
      }
      if (name === "asana.add_task_comment") {
        const input = commentInput(args);
        await ensureTaskInProject(input.taskGid);
        return request(`${taskPath(input.taskGid)}/stories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { text: input.text } }),
        });
      }
      throw new Error(`Unknown Asana tool: ${name}`);
    },
  };
}
