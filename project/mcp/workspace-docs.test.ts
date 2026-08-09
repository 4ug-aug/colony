import { expect, test } from "bun:test";
import {
  createWorkspaceDocsMcpUpstream,
  type WorkspaceDocsPort,
} from "./workspace-docs";

const summary = {
  id: "doc-1",
  title: "Grill decisions",
  createdBy: { id: "ada", name: "Ada" },
  createdAt: 10,
  updatedAt: 20,
};

const port: WorkspaceDocsPort = {
  listDocs: () => [summary],
  getDoc: (id) =>
    id === summary.id ? { ...summary, body: "# Decisions\n" } : undefined,
};

test("workspace Docs tools are read-only and return metadata then content", async () => {
  const upstream = createWorkspaceDocsMcpUpstream({ port });
  expect((await upstream.listTools()).map((tool) => tool.name)).toEqual([
    "workspace.list_docs",
    "workspace.get_doc",
  ]);
  expect(await upstream.callTool("workspace.list_docs", {})).toEqual({
    content: [{ type: "text", text: JSON.stringify([summary], null, 2) }],
  });
  expect(await upstream.callTool("workspace.get_doc", { id: "doc-1" })).toEqual({
    content: [
      {
        type: "text",
        text: JSON.stringify({ ...summary, body: "# Decisions\n" }, null, 2),
      },
    ],
  });
  await expect(
    upstream.callTool("workspace.get_doc", { id: "missing" }),
  ).rejects.toThrow("Doc not found");
});
