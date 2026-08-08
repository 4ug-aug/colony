import { expect, test } from "bun:test";
import {
  createWorkspaceGrillMcpUpstream,
  type GrillFrontier,
  type WorkspaceGrillPort,
} from "./workspace-grill";

function makePort(): WorkspaceGrillPort & {
  calls: { questions: GrillFrontier["questions"]; drafts?: Record<string, string> }[];
  frontier: GrillFrontier;
} {
  const calls: {
    questions: GrillFrontier["questions"];
    drafts?: Record<string, string>;
  }[] = [];
  let frontier: GrillFrontier = { questions: [], drafts: {} };
  return {
    calls,
    get frontier() {
      return frontier;
    },
    setFrontier(questions, drafts) {
      calls.push(drafts === undefined ? { questions } : { questions, drafts });
      frontier = { questions, drafts: drafts ?? {} };
      return frontier;
    },
  };
}

test("listTools returns workspace.set_grill_frontier", async () => {
  const upstream = createWorkspaceGrillMcpUpstream({ port: makePort() });
  const tools = await upstream.listTools();
  expect(tools.map((tool) => tool.name)).toEqual([
    "workspace.set_grill_frontier",
  ]);
});

test("set_grill_frontier updates the port and returns the frontier", async () => {
  const port = makePort();
  const upstream = createWorkspaceGrillMcpUpstream({ port });
  const questions = [
    { id: "q1", prompt: "What is the goal?" },
    { id: "q2", prompt: "What is out of scope?" },
  ];
  const drafts = { q1: "ship the MVP" };

  const result = (await upstream.callTool("workspace.set_grill_frontier", {
    questions,
    drafts,
  })) as { content: { text: string }[] };

  expect(JSON.parse(result.content[0]!.text)).toEqual({
    questions,
    drafts,
  });
  expect(port.calls).toEqual([{ questions, drafts }]);
  expect(port.frontier).toEqual({ questions, drafts });
});

test("set_grill_frontier omits drafts when not provided", async () => {
  const port = makePort();
  const upstream = createWorkspaceGrillMcpUpstream({ port });
  const questions = [{ id: "q1", prompt: "Why now?" }];

  await upstream.callTool("workspace.set_grill_frontier", { questions });

  expect(port.calls).toEqual([{ questions }]);
  expect(port.frontier).toEqual({ questions, drafts: {} });
});
