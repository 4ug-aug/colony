import type { McpTool, McpUpstream } from "./gateway";

const paymoUrl = "https://app.paymoapp.com/api";

export const PAYMO_TOOLS = [
  "paymo.list_projects",
  "paymo.list_tasks",
  "paymo.add_time",
] as const;

const tools = (today: string): readonly McpTool[] => [
  {
    name: "paymo.list_projects",
    description:
      "List active Paymo projects (id and name). Pass query to filter by name.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "paymo.list_tasks",
    description:
      "List open tasks in a Paymo project. Time is logged on a task: pick the one the person named, otherwise the most general one.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "integer" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "paymo.add_time",
    description: `Log time on a Paymo task for the person who asked (always them; you cannot log for anyone else). Today is ${today}; date defaults to today.`,
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "integer" },
        hours: { type: "number", exclusiveMinimum: 0, maximum: 24 },
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        description: { type: "string" },
      },
      required: ["taskId", "hours"],
      additionalProperties: false,
    },
  },
];

type Named = { id: number; name: string };

const localDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const integer = (value: unknown, label: string): number => {
  if (!Number.isInteger(value) || (value as number) < 1)
    throw new Error(`Paymo ${label} must be a positive integer`);
  return value as number;
};

export function createPaymoMcpUpstream(options: {
  apiKey: string;
  /** Email of the account the run acts for; Paymo time is only ever logged as this person. */
  requesterEmail?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}): McpUpstream {
  const now = options.now ?? (() => new Date());
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(`${paymoUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          // Paymo API keys go in Basic auth as the username; the password is ignored.
          Authorization: `Basic ${btoa(`${options.apiKey}:X`)}`,
        },
      });
    } catch {
      throw new Error("Paymo request failed");
    }
    if (!response.ok) {
      if (response.status === 401) throw new Error("Paymo rejected the API key");
      if (response.status === 403)
        throw new Error(
          "Paymo denied access. The API key must belong to a Paymo admin to log time for teammates.",
        );
      if (response.status === 404) throw new Error("Paymo resource was not found");
      if (response.status === 429) throw new Error("Paymo rate limit exceeded");
      throw new Error(`Paymo request failed (${response.status})`);
    }
    return (await response.json()) as T;
  };

  const requester = async (): Promise<Named & { email: string }> => {
    const email = options.requesterEmail?.trim().toLowerCase();
    if (!email)
      throw new Error("This run isn't tied to a person, so there's no one to log Paymo time for");
    const { users } = await request<{
      users: (Named & { email: string; active?: boolean })[];
    }>("/users");
    // ponytail: lists every user per call; filter server-side if the team grows large.
    const user = users.find((entry) => entry.email?.toLowerCase() === email);
    if (!user) throw new Error(`No Paymo user has the email ${email}`);
    return user;
  };

  return {
    listTools: async () => tools(localDate(now())),
    async callTool(name, args) {
      if (name === "paymo.list_projects") {
        const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
        const { projects } = await request<{ projects: Named[] }>(
          `/projects?where=${encodeURIComponent("active=true")}`,
        );
        return projects
          .filter((project) => !query || project.name.toLowerCase().includes(query))
          .map(({ id, name }) => ({ id, name }));
      }
      if (name === "paymo.list_tasks") {
        const projectId = integer(args.projectId, "projectId");
        const { tasks } = await request<{ tasks: (Named & { complete?: boolean })[] }>(
          `/tasks?where=${encodeURIComponent(`project_id=${projectId}`)}`,
        );
        return tasks.filter((task) => !task.complete).map(({ id, name }) => ({ id, name }));
      }
      if (name === "paymo.add_time") {
        const taskId = integer(args.taskId, "taskId");
        const hours = args.hours;
        if (typeof hours !== "number" || !(hours > 0) || hours > 24)
          throw new Error("Paymo hours must be more than 0 and at most 24");
        const date = args.date === undefined ? localDate(now()) : args.date;
        if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
          throw new Error("Paymo date must be YYYY-MM-DD");
        const description = typeof args.description === "string" ? args.description.trim() : "";
        const user = await requester();
        const { entries } = await request<{ entries: { id: number }[] }>("/entries", {
          method: "POST",
          body: JSON.stringify({
            task_id: taskId,
            user_id: user.id,
            date,
            duration: Math.round(hours * 3600),
            ...(description ? { description } : {}),
          }),
        });
        return { entryId: entries[0]?.id, user: user.name, taskId, date, hours };
      }
      throw new Error(`Unknown Paymo tool: ${name}`);
    },
  };
}
