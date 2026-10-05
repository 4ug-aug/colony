import { expect, test } from "bun:test";
import { createWorkspaceConsultationsMcpUpstream } from "./workspace-consultations";

const upstream = (asked: unknown[]) =>
  createWorkspaceConsultationsMcpUpstream({
    port: {
      ask: async (consultation) => {
        asked.push(consultation);
        return "Use bun test --watch.";
      },
    },
    askingAgentId: "antboy",
    askingRunId: "run-1",
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
