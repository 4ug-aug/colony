import { expect, test } from "bun:test";
import {
  createWorkspaceIssuesMcpUpstream,
  type WorkspaceIssue,
  type WorkspaceIssuesPort,
} from "./workspace-issues";

function makePort(seed: WorkspaceIssue[] = []): WorkspaceIssuesPort & {
  issues: WorkspaceIssue[];
} {
  const issues = [...seed];
  let nextNumber = seed.reduce((max, issue) => Math.max(max, issue.number), 0) + 1;
  const byRef = (ref: string) => {
    const match = /^SWE-(\d+)$/i.exec(ref.trim());
    if (match) return issues.find((issue) => issue.number === Number(match[1]));
    return issues.find((issue) => issue.id === ref.trim());
  };
  return {
    issues,
    listIssues(filter) {
      return filter?.status
        ? issues.filter((issue) => issue.status === filter.status)
        : [...issues];
    },
    getIssue(ref) {
      return byRef(ref);
    },
    createIssue(input) {
      const issue: WorkspaceIssue = {
        id: `id-${nextNumber}`,
        number: nextNumber,
        title: input.title,
        description: input.description ?? "",
        status: input.status ?? "backlog",
        priority: input.priority ?? "none",
        tags: input.tags ?? [],
        timeSpent: [],
        ...(input.parentId ? { parentId: input.parentId } : {}),
        ...(input.owner ? { owner: input.owner } : {}),
        createdAt: nextNumber,
        updatedAt: nextNumber,
      };
      nextNumber += 1;
      issues.push(issue);
      return issue;
    },
    updateIssue(ref, patch) {
      const issue = byRef(ref);
      if (!issue) throw new Error(`Issue not found: ${ref}`);
      Object.assign(issue, {
        ...patch,
        parentId:
          patch.parentId === undefined
            ? issue.parentId
            : patch.parentId === null
              ? undefined
              : patch.parentId,
        updatedAt: issue.updatedAt + 1,
      });
      if (patch.parentId === null) delete issue.parentId;
      return issue;
    },
    assignIssue(ref, owner) {
      const issue = byRef(ref);
      if (!issue) throw new Error(`Issue not found: ${ref}`);
      if (owner) issue.owner = owner;
      else delete issue.owner;
      issue.updatedAt += 1;
      return issue;
    },
  };
}

test("listTools returns the five Issue tools", async () => {
  const upstream = createWorkspaceIssuesMcpUpstream({ port: makePort() });
  const tools = await upstream.listTools();
  expect(tools.map((tool) => tool.name)).toEqual([
    "workspace.list_issues",
    "workspace.get_issue",
    "workspace.create_issue",
    "workspace.update_issue",
    "workspace.assign_issue",
  ]);
});

test("create, assign, and get Issues through MCP tools", async () => {
  const port = makePort();
  const upstream = createWorkspaceIssuesMcpUpstream({ port });
  const created = (await upstream.callTool("workspace.create_issue", {
    title: "Dock badge",
    description: "Show unread count",
  })) as { content: { text: string }[] };
  const issue = JSON.parse(created.content[0]!.text) as WorkspaceIssue;
  expect(issue.number).toBe(1);

  await upstream.callTool("workspace.assign_issue", {
    ref: "SWE-1",
    owner: { kind: "agent", id: "software-engineer" },
  });
  const got = (await upstream.callTool("workspace.get_issue", {
    ref: "SWE-1",
  })) as { content: { text: string }[] };
  expect(JSON.parse(got.content[0]!.text)).toMatchObject({
    title: "Dock badge",
    owner: { kind: "agent", id: "software-engineer" },
  });
  expect(port.issues).toHaveLength(1);
});
