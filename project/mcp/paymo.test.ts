import { expect, test } from "bun:test";
import { createPaymoMcpUpstream } from "./paymo";

function fakePaymo() {
  const calls: { method: string; path: string; body?: unknown; auth?: string }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({
      method,
      path: url.pathname + url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init?.headers).get("authorization") ?? undefined,
    });
    const body =
      url.pathname === "/api/users"
        ? { users: [{ id: 7, name: "Someone Else", email: "other@acme.dk" }, { id: 42, name: "August", email: "ABT@acme.dk" }] }
        : url.pathname === "/api/projects"
          ? { projects: [{ id: 1, name: "Intellagent", client_id: 3 }, { id: 2, name: "Internal" }] }
          : url.pathname === "/api/tasks"
            ? { tasks: [{ id: 10, name: "Development" }, { id: 11, name: "Old", complete: true }] }
            : { entries: [{ id: 99 }] };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const now = () => new Date(2026, 9, 2, 14, 0);

test("add_time logs for the requester matched by email, defaulting to today", async () => {
  const paymo = fakePaymo();
  const upstream = createPaymoMcpUpstream({ apiKey: "key", requesterEmail: "abt@acme.dk", fetch: paymo.fetch, now });

  const result = await upstream.callTool("paymo.add_time", { taskId: 10, hours: 7.5, description: "Review" });

  expect(result).toEqual({ entryId: 99, user: "August", taskId: 10, date: "2026-10-02", hours: 7.5 });
  const entry = paymo.calls.find((call) => call.path === "/api/entries")!;
  expect(entry.method).toBe("POST");
  expect(entry.body).toEqual({ task_id: 10, user_id: 42, date: "2026-10-02", duration: 27000, description: "Review" });
  expect(entry.auth).toBe(`Basic ${btoa("key:X")}`);
});

test("add_time ignores a user id from the agent", async () => {
  const paymo = fakePaymo();
  const upstream = createPaymoMcpUpstream({ apiKey: "key", requesterEmail: "abt@acme.dk", fetch: paymo.fetch, now });
  await upstream.callTool("paymo.add_time", { taskId: 10, hours: 1, userId: 7, user_id: 7 });
  expect(paymo.calls.find((call) => call.path === "/api/entries")!.body).toMatchObject({ user_id: 42 });
});

test("add_time refuses without a requester or a matching Paymo user", async () => {
  const paymo = fakePaymo();
  await expect(
    createPaymoMcpUpstream({ apiKey: "key", fetch: paymo.fetch, now }).callTool("paymo.add_time", { taskId: 10, hours: 1 }),
  ).rejects.toThrow("isn't tied to a person");
  await expect(
    createPaymoMcpUpstream({ apiKey: "key", requesterEmail: "nobody@acme.dk", fetch: paymo.fetch, now }).callTool(
      "paymo.add_time",
      { taskId: 10, hours: 1 },
    ),
  ).rejects.toThrow("No Paymo user has the email nobody@acme.dk");
  expect(paymo.calls.some((call) => call.path === "/api/entries")).toBe(false);
});

test("add_time validates hours and date", async () => {
  const upstream = createPaymoMcpUpstream({ apiKey: "key", requesterEmail: "abt@acme.dk", fetch: fakePaymo().fetch, now });
  await expect(upstream.callTool("paymo.add_time", { taskId: 10, hours: 0 })).rejects.toThrow("hours");
  await expect(upstream.callTool("paymo.add_time", { taskId: 10, hours: 25 })).rejects.toThrow("hours");
  await expect(upstream.callTool("paymo.add_time", { taskId: 10, hours: 1, date: "2.10.2026" })).rejects.toThrow("YYYY-MM-DD");
});

test("lists active projects filtered by name and open tasks", async () => {
  const paymo = fakePaymo();
  const upstream = createPaymoMcpUpstream({ apiKey: "key", fetch: paymo.fetch, now });
  expect(await upstream.callTool("paymo.list_projects", { query: "intell" })).toEqual([{ id: 1, name: "Intellagent" }]);
  expect(await upstream.callTool("paymo.list_tasks", { projectId: 1 })).toEqual([{ id: 10, name: "Development" }]);
  expect(paymo.calls.map((call) => call.path)).toEqual([
    `/api/projects?where=${encodeURIComponent("active=true")}`,
    `/api/tasks?where=${encodeURIComponent("project_id=1")}`,
  ]);
  const tools = await upstream.listTools();
  expect(tools.find((tool) => tool.name === "paymo.add_time")?.description).toContain("Today is 2026-10-02");
});
