import { expect, test } from "bun:test";
import {
  createWorkspaceGrillMcpUpstream,
  type GrillFrontier,
  type GrillIssueProposal,
  type GrillProposedIssue,
  type WorkspaceGrillPort,
} from "./workspace-grill";

function makePort(): WorkspaceGrillPort & {
  calls: { questions: GrillFrontier["questions"]; drafts?: Record<string, string> }[];
  proposals: GrillProposedIssue[][];
  writeups: { title: string; body: string }[];
  frontier: GrillFrontier;
  proposal: GrillIssueProposal | undefined;
  writeup: { title: string; body: string } | undefined;
} {
  const calls: {
    questions: GrillFrontier["questions"];
    drafts?: Record<string, string>;
  }[] = [];
  const proposals: GrillProposedIssue[][] = [];
  const writeups: { title: string; body: string }[] = [];
  let frontier: GrillFrontier = { questions: [], drafts: {} };
  let proposal: GrillIssueProposal | undefined;
  let writeup: { title: string; body: string } | undefined;
  return {
    calls,
    proposals,
    writeups,
    get frontier() {
      return frontier;
    },
    get proposal() {
      return proposal;
    },
    get writeup() {
      return writeup;
    },
    setFrontier(questions, drafts) {
      calls.push(drafts === undefined ? { questions } : { questions, drafts });
      frontier = { questions, drafts: drafts ?? {} };
      return frontier;
    },
    proposeIssues(issues) {
      proposals.push(issues);
      proposal = { status: "proposed", issues };
      return proposal;
    },
    proposeWriteup(next) {
      writeups.push(next);
      writeup = next;
      return writeup;
    },
  };
}

test("listTools returns frontier, issue proposal, and writeup tools", async () => {
  const upstream = createWorkspaceGrillMcpUpstream({ port: makePort() });
  const tools = await upstream.listTools();
  expect(tools.map((tool) => tool.name)).toEqual([
    "workspace.set_grill_frontier",
    "workspace.propose_grill_issues",
    "workspace.propose_grill_writeup",
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

test("set_grill_frontier round-trips optional recommendation", async () => {
  const port = makePort();
  const upstream = createWorkspaceGrillMcpUpstream({ port });
  const questions = [
    {
      id: "q1",
      prompt: "Which unresolved branches matter most?",
      recommendation:
        "Pick decisions where disagreeing now would cause rework in architecture or UX.",
    },
    { id: "q2", prompt: "What can wait?" },
  ];

  const result = (await upstream.callTool("workspace.set_grill_frontier", {
    questions,
  })) as { content: { text: string }[] };

  expect(JSON.parse(result.content[0]!.text)).toEqual({
    questions,
    drafts: {},
  });
  expect(port.frontier).toEqual({ questions, drafts: {} });
});

test("set_grill_frontier rejects blank recommendation", async () => {
  const port = makePort();
  const upstream = createWorkspaceGrillMcpUpstream({ port });

  await expect(
    upstream.callTool("workspace.set_grill_frontier", {
      questions: [{ id: "q1", prompt: "Why?", recommendation: "   " }],
    }),
  ).rejects.toThrow("Invalid questions");
});

test("propose_grill_issues publishes an Issue tree proposal", async () => {
  const port = makePort();
  const upstream = createWorkspaceGrillMcpUpstream({ port });
  const issues = [
    { key: "root", title: "Ship Grill", description: "Parent" },
    { key: "child", title: "Frontier UX", parentKey: "root" },
  ];

  const result = (await upstream.callTool("workspace.propose_grill_issues", {
    issues,
  })) as { content: { text: string }[] };

  expect(JSON.parse(result.content[0]!.text)).toEqual({
    status: "proposed",
    issues,
  });
  expect(port.proposals).toEqual([issues]);
  expect(port.proposal).toEqual({ status: "proposed", issues });
});

test("propose_grill_writeup publishes a Doc writeup proposal", async () => {
  const port = makePort();
  const upstream = createWorkspaceGrillMcpUpstream({ port });
  const writeup = {
    title: "Collaborative Grill",
    body: "# Decisions\n\nUse Docs for General Grill.\n",
  };

  const result = (await upstream.callTool("workspace.propose_grill_writeup", {
    ...writeup,
  })) as { content: { text: string }[] };

  expect(JSON.parse(result.content[0]!.text)).toEqual(writeup);
  expect(port.writeups).toEqual([writeup]);
});
