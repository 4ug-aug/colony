import { expect, test } from "bun:test";
import { createWorkspaceConsultationsMcpUpstream } from "./workspace-consultations";

const upstream = (asked: unknown[]) =>
  createWorkspaceConsultationsMcpUpstream({
    port: {
      ask: async (consultation) => {
        asked.push(consultation);
        return "Use bun test --watch.";
      },
      askableAgents: (accountId) => accountId !== "ada" ? [] : [
        { id: "antboy", name: "Antboy", description: "Collaborative teammate." },
        {
          id: "software-engineer",
          name: "Software engineer",
          description: "Build, debug, and review code.",
        },
      ],
    },
    askingAgentId: "antboy",
    askingRunId: "run-1",
    accountId: "ada",
  });

test("ask_agent asks the named agent on behalf of the asking run and returns its answer", async () => {
  const asked: unknown[] = [];
  const result = await upstream(asked).callTool("workspace.ask_agent", {
    agentDefinitionId: "software-engineer",
    question: "How do I rerun tests on save?",
  });

  expect(asked).toEqual([
    {
      askingAgentId: "antboy",
      askingRunId: "run-1",
      agentDefinitionId: "software-engineer",
      question: "How do I rerun tests on save?",
    },
  ]);
  expect(result).toEqual({
    content: [{ type: "text", text: "Use bun test --watch." }],
  });
});

test("ask_agent needs an agent and a question", async () => {
  const asked: unknown[] = [];
  const ask = (args: Record<string, unknown>) =>
    upstream(asked).callTool("workspace.ask_agent", args);
  await expect(ask({ question: "Hi?" })).rejects.toThrow("agentDefinitionId");
  await expect(ask({ agentDefinitionId: "software-engineer", question: "  " })).rejects.toThrow("question");
  expect(asked).toEqual([]);
});

test("ask_agent names the agents it can ask, so no other tool is needed to find one", async () => {
  const [tool] = await upstream([]).listTools();
  const agent = (tool!.inputSchema as {
    properties: { agentDefinitionId: { enum: string[] } };
  }).properties.agentDefinitionId;
  // Never the asking agent itself.
  expect(agent.enum).toEqual(["software-engineer"]);
  expect(tool!.description).toContain(
    "software-engineer (Software engineer): Build, debug, and review code.",
  );
  expect(tool!.description).not.toContain("antboy (");
});

test("ask_agent refuses agents the account cannot ask, including itself", async () => {
  const asked: unknown[] = [];
  const ask = (agentDefinitionId: string) =>
    upstream(asked).callTool("workspace.ask_agent", {
      agentDefinitionId,
      question: "Hi?",
    });
  await expect(ask("someone-elses-private-agent")).rejects.toThrow(
    "Unknown agent: someone-elses-private-agent",
  );
  await expect(ask("antboy")).rejects.toThrow("Unknown agent: antboy");
  expect(asked).toEqual([]);
});
