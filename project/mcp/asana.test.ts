import { expect, test } from "bun:test";
import { createAsanaMcpUpstream, readAsanaConfiguration } from "./asana";
import { createMcpGateway } from "./gateway";
import { createAsanaSoftwareEngineerAdapter } from "../agents/software-engineer-adapters";

const token = "asana-secret-token";
const projectGid = "project-1";
const listFields =
  "gid%2Cname%2Ccompleted%2Cassignee.name%2Cdue_on%2Ctags.name%2Cmemberships.project.gid%2Cmemberships.section.name";
const taskFields =
  "gid,name,notes,completed,assignee.name,due_on,tags.name,memberships.project.gid,memberships.section.name,created_at,modified_at,permalink_url";
const text = (value: string) => ({ content: [{ type: "text", text: value }] });

test("Asana lists only open tasks unless asked for completed ones", async () => {
  const urls: string[] = [];
  const upstream = createAsanaMcpUpstream({
    apiToken: token,
    projectGid,
    now: () => new Date("2026-10-06T08:00:00.000Z"),
    fetch: async (url) => {
      urls.push(String(url));
      return Response.json({ data: [] });
    },
  });
  await expect(upstream.callTool("asana.list_tasks", {})).resolves.toEqual(
    text("No open tasks in the project."),
  );
  expect(urls[0]).toContain("completed_since=2026-10-06T08%3A00%3A00.000Z");
});

test("Asana uses the configured project and bounded task pagination", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const upstream = createAsanaMcpUpstream({
    apiToken: token,
    projectGid,
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("?opt_fields=memberships.project.gid")) {
        return Response.json({
          data: { memberships: [{ project: { gid: projectGid } }] },
        });
      }
      return Response.json({
        data: [
          {
            gid: "task-1",
            name: "Ship it",
            completed: false,
            assignee: { name: "Ada" },
            due_on: "2026-10-08",
            tags: [{ name: "release" }],
            memberships: [
              { project: { gid: "other" }, section: { name: "Elsewhere" } },
              { project: { gid: projectGid }, section: { name: "Review" } },
            ],
          },
          { gid: "task-2", name: "Old chore", completed: true, assignee: null },
        ],
        next_page: { offset: "next-page", path: "/noise", uri: "https://noise" },
      });
    },
  });

  await upstream.callTool("asana.get_project", {});
  await expect(
    upstream.callTool("asana.list_tasks", {
      includeCompleted: true,
      limit: 20,
      offset: "previous-page",
    }),
  ).resolves.toEqual(
    text(
      [
        "2 tasks in the project. Pass a task's id to asana.get_task for details.",
        "",
        "- Ship it · Review · Ada · due 2026-10-08 · #release · id task-1",
        "- [done] Old chore · unassigned · id task-2",
        "",
        'More tasks: call asana.list_tasks with offset "next-page".',
      ].join("\n"),
    ),
  );
  await upstream.callTool("asana.get_task", { taskGid: "task-1" });
  await upstream.callTool("asana.get_task_comments", { taskGid: "task-1" });
  await expect(
    upstream.callTool("asana.set_task_completion", {
      taskGid: "task-1",
      completed: true,
    }),
  ).resolves.toEqual(text("Marked task task-1 complete."));
  await expect(
    upstream.callTool("asana.add_task_comment", {
      taskGid: "task-1",
      text: "Done",
    }),
  ).resolves.toEqual(text("Commented on task task-1."));

  expect(requests.map(({ url, init }) => [init?.method ?? "GET", url])).toEqual(
    [
      [
        "GET",
        "https://app.asana.com/api/1.0/projects/project-1?opt_fields=gid,name,permalink_url",
      ],
      [
        "GET",
        `https://app.asana.com/api/1.0/projects/project-1/tasks?limit=20&opt_fields=${listFields}&completed_since=1970-01-01T00%3A00%3A00.000Z&offset=previous-page`,
      ],
      [
        "GET",
        "https://app.asana.com/api/1.0/tasks/task-1?opt_fields=memberships.project.gid",
      ],
      [
        "GET",
        `https://app.asana.com/api/1.0/tasks/task-1?opt_fields=${taskFields}`,
      ],
      [
        "GET",
        "https://app.asana.com/api/1.0/tasks/task-1?opt_fields=memberships.project.gid",
      ],
      [
        "GET",
        "https://app.asana.com/api/1.0/tasks/task-1/stories?opt_fields=gid,text,created_by.name,resource_subtype,created_at",
      ],
      [
        "GET",
        "https://app.asana.com/api/1.0/tasks/task-1?opt_fields=memberships.project.gid",
      ],
      ["PUT", "https://app.asana.com/api/1.0/tasks/task-1"],
      [
        "GET",
        "https://app.asana.com/api/1.0/tasks/task-1?opt_fields=memberships.project.gid",
      ],
      ["POST", "https://app.asana.com/api/1.0/tasks/task-1/stories"],
    ],
  );
  expect(JSON.parse(requests[7].init?.body as string)).toEqual({
    data: { completed: true },
  });
  expect(JSON.parse(requests[9].init?.body as string)).toEqual({
    data: { text: "Done" },
  });
  expect(new Headers(requests[9].init?.headers).get("authorization")).toBe(
    `Bearer ${token}`,
  );
});

test("Asana rejects every task operation outside the configured project before reading or writing", async () => {
  const requests: string[] = [];
  const upstream = createAsanaMcpUpstream({
    apiToken: token,
    projectGid,
    fetch: async (url) => {
      requests.push(String(url));
      return Response.json({
        data: { memberships: [{ project: { gid: "other-project" } }] },
      });
    },
  });

  for (const [name, args] of [
    ["asana.get_task", { taskGid: "other-task" }],
    ["asana.get_task_comments", { taskGid: "other-task" }],
    ["asana.set_task_completion", { taskGid: "other-task", completed: true }],
    ["asana.add_task_comment", { taskGid: "other-task", text: "nope" }],
  ] as const) {
    await expect(upstream.callTool(name, args)).rejects.toThrow(
      "Asana task is outside the configured project",
    );
  }
  expect(requests).toEqual(
    Array(4).fill(
      "https://app.asana.com/api/1.0/tasks/other-task?opt_fields=memberships.project.gid",
    ),
  );
});

test("Asana creates tasks only in the configured project", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const upstream = createAsanaMcpUpstream({
    apiToken: token,
    projectGid,
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({ data: { gid: "task-1", name: "Ship it" } });
    },
  });

  await expect(
    upstream.callTool("asana.create_task", {
      name: "Ship it",
      description: "Ready to release",
    }),
  ).resolves.toEqual(text('Created "Ship it" (id task-1).'));

  expect(requests.map(({ url, init }) => [init?.method, url])).toEqual([
    [
      "POST",
      "https://app.asana.com/api/1.0/tasks?opt_fields=gid,name,permalink_url",
    ],
  ]);
  expect(JSON.parse(requests[0].init?.body as string)).toEqual({
    data: {
      name: "Ship it",
      notes: "Ready to release",
      projects: [projectGid],
    },
  });
});

test("Asana get_task returns notes and get_task_comments keeps only comments", async () => {
  const upstream = createAsanaMcpUpstream({
    apiToken: token,
    projectGid,
    fetch: async (url) => {
      if (String(url).endsWith("?opt_fields=memberships.project.gid")) {
        return Response.json({
          data: { memberships: [{ project: { gid: projectGid } }] },
        });
      }
      if (String(url).includes("/stories")) {
        return Response.json({
          data: [
            {
              gid: "story-1",
              text: "Looks good",
              resource_subtype: "comment_added",
              created_by: { name: "Ada" },
              created_at: "2026-01-01T00:00:00.000Z",
            },
            {
              gid: "story-2",
              text: "marked this task complete",
              resource_subtype: "marked_complete",
              created_by: { name: "Ada" },
              created_at: "2026-01-02T00:00:00.000Z",
            },
          ],
        });
      }
      return Response.json({
        data: {
          gid: "task-1",
          name: "Ship it",
          notes: "Ready to release",
          completed: false,
          assignee: { name: "Ada" },
          due_on: "2026-10-08",
          tags: [],
          memberships: [
            { project: { gid: projectGid }, section: { name: "Review" } },
          ],
          created_at: "2026-10-01T09:00:00.000Z",
          modified_at: "2026-10-05T14:30:00.000Z",
          permalink_url: "https://app.asana.com/0/1/task-1",
        },
      });
    },
  });

  await expect(
    upstream.callTool("asana.get_task", { taskGid: "task-1" }),
  ).resolves.toEqual(
    text(
      [
        "Ship it (open)",
        "Id: task-1",
        "Section: Review · Assignee: Ada · Due: 2026-10-08",
        "Created 2026-10-01 · Modified 2026-10-05",
        "Link: https://app.asana.com/0/1/task-1",
        "",
        "Ready to release",
      ].join("\n"),
    ),
  );
  await expect(
    upstream.callTool("asana.get_task_comments", { taskGid: "task-1" }),
  ).resolves.toEqual(text("- Ada (2026-01-01): Looks good"));
});

test("Asana exposes only its seven granted tools and keeps token errors safe", async () => {
  const upstream = createAsanaMcpUpstream({
    apiToken: token,
    projectGid,
    fetch: async () =>
      Response.json({ errors: [{ message: token }] }, { status: 401 }),
  });
  const gateway = createMcpGateway({
    upstream,
    createToken: () => "run-token",
  });
  const session = gateway.createSession({
    tools: [
      "asana.get_project",
      "asana.create_task",
      "asana.list_tasks",
      "asana.get_task",
      "asana.get_task_comments",
      "asana.set_task_completion",
      "asana.list_users",
      "asana.assign_task",
      "asana.add_task_comment",
    ],
    expiresAt: new Date(Date.now() + 60_000),
  });

  expect(
    (await gateway.listTools(session.token)).map((tool) => tool.name),
  ).toEqual(
    session
      ? [
          "asana.get_project",
          "asana.create_task",
          "asana.list_tasks",
          "asana.get_task",
          "asana.get_task_comments",
          "asana.set_task_completion",
          "asana.list_users",
          "asana.assign_task",
          "asana.add_task_comment",
        ]
      : [],
  );
  await expect(
    gateway.callTool(session.token, "asana.get_project", {}),
  ).rejects.toThrow("Asana access was denied");
  await expect(
    gateway.callTool(session.token, "asana.delete_task", {}),
  ).rejects.toThrow("MCP tool is not granted");
  try {
    await gateway.callTool(session.token, "asana.get_project", {});
  } catch (error) {
    expect(String(error)).not.toContain(token);
  }
});

test("Asana reports retry timing without retrying writes", async () => {
  let calls = 0;
  const upstream = createAsanaMcpUpstream({
    apiToken: token,
    projectGid,
    fetch: async () => {
      calls += 1;
      return Response.json(
        {},
        { status: 429, headers: { "retry-after": "12" } },
      );
    },
  });

  await expect(upstream.callTool("asana.list_tasks", {})).rejects.toThrow(
    "retry after 12 seconds",
  );
  expect(calls).toBe(1);
});

test("Asana configuration must be complete and creates the scoped adapter only when used", async () => {
  expect(readAsanaConfiguration({})).toBeUndefined();
  expect(
    readAsanaConfiguration({
      ASANA_API_TOKEN: token,
      ASANA_PROJECT_GID: projectGid,
    }),
  ).toEqual({ apiToken: token, projectGid });
  expect(() => readAsanaConfiguration({ ASANA_API_TOKEN: token })).toThrow(
    "configured together",
  );
  expect(() =>
    readAsanaConfiguration({ ASANA_PROJECT_GID: projectGid }),
  ).toThrow("configured together");

  const adapter = createAsanaSoftwareEngineerAdapter({
    apiToken: token,
    projectGid,
  });
  expect(adapter.capability?.id).toBe("asana.tasks");
  expect(
    (await adapter.capability!.createUpstream({}).listTools()).map(
      (tool) => tool.name,
    ),
  ).toEqual([
    "asana.get_project",
    "asana.create_task",
    "asana.list_tasks",
    "asana.get_task",
    "asana.get_task_comments",
    "asana.set_task_completion",
    "asana.list_users",
    "asana.assign_task",
    "asana.add_task_comment",
  ]);
});

test("Asana lists only the configured project's members, not the whole workspace", async () => {
  const urls: string[] = [];
  const upstream = createAsanaMcpUpstream({
    apiToken: token,
    projectGid,
    fetch: async (url) => {
      urls.push(String(url));
      return Response.json({
        data: {
          members: [
            { gid: "user-1", name: "Mads W. Hansen", email: "mwh@example.test" },
            { gid: "user-2", name: "Ada Lovelace" },
          ],
        },
      });
    },
  });

  await expect(upstream.callTool("asana.list_users", {})).resolves.toEqual(
    text(
      [
        "2 members of the Asana project. Pass an id or email to asana.assign_task.",
        "",
        "- Mads W. Hansen · mwh@example.test · id user-1",
        "- Ada Lovelace · id user-2",
      ].join("\n"),
    ),
  );
  expect(urls).toEqual([
    `https://app.asana.com/api/1.0/projects/${projectGid}?opt_fields=members.name%2Cmembers.email`,
  ]);
  await expect(upstream.callTool("asana.list_users", { offset: "x" })).rejects.toThrow(
    "Invalid Asana tool arguments",
  );
});

test("Asana assigns a task only to a project member, or unassigns it", async () => {
  const writes: unknown[] = [];
  const upstream = createAsanaMcpUpstream({
    apiToken: token,
    projectGid,
    fetch: async (url, init) => {
      if (String(url).endsWith("?opt_fields=memberships.project.gid"))
        return Response.json({
          data: { memberships: [{ project: { gid: String(url).includes("other") ? "x" : projectGid } }] },
        });
      if (String(url).includes("members.email"))
        return Response.json({
          data: { members: [{ gid: "user-1", name: "Mads W. Hansen", email: "MWH@example.test" }] },
        });
      const body = JSON.parse(String(init?.body));
      writes.push([String(url), init?.method, body]);
      return Response.json({
        data: { gid: "task-1", assignee: body.data.assignee ? { name: "Mads W. Hansen" } : null },
      });
    },
  });

  await expect(
    upstream.callTool("asana.assign_task", { taskGid: "task-1", assignee: "mwh@example.test" }),
  ).resolves.toEqual(text("Assigned task task-1 to Mads W. Hansen."));
  await expect(
    upstream.callTool("asana.assign_task", { taskGid: "task-1", assignee: null }),
  ).resolves.toEqual(text("Unassigned task task-1."));
  await expect(
    upstream.callTool("asana.assign_task", { taskGid: "task-1", assignee: "stranger@example.test" }),
  ).rejects.toThrow("stranger@example.test is not a member of the Asana project; use asana.list_users");
  await expect(
    upstream.callTool("asana.assign_task", { taskGid: "other", assignee: "user-1" }),
  ).rejects.toThrow("Asana task is outside the configured project");
  await expect(upstream.callTool("asana.assign_task", { taskGid: "task-1" })).rejects.toThrow(
    "Asana assignee must be a user id, an email, or null",
  );
  expect(writes).toEqual([
    ["https://app.asana.com/api/1.0/tasks/task-1?opt_fields=assignee.name", "PUT", { data: { assignee: "user-1" } }],
    ["https://app.asana.com/api/1.0/tasks/task-1?opt_fields=assignee.name", "PUT", { data: { assignee: null } }],
  ]);
});
