import type { AgentInputItem } from "@openai/agents";
import { expect, test } from "bun:test";
import { createCompactor, estimateTokens } from "./compaction";

const user = (content: string) => ({ role: "user", content }) as AgentInputItem;
const assistant = (text: string) =>
  ({ role: "assistant", status: "completed", content: [{ type: "output_text", text }] }) as AgentInputItem;
const call = (id: string) =>
  ({ type: "function_call", callId: id, name: "exec_command", arguments: "{}" }) as AgentInputItem;
const result = (id: string, output: string) =>
  ({ type: "function_call_result", callId: id, name: "exec_command", status: "completed", output }) as AgentInputItem;

/** A task followed by `count` tool round trips with `size`-char outputs. */
const history = (count: number, size: number) => [
  user("Fix the build."),
  ...Array.from({ length: count }, (_, index) => [call(`c${index}`), result(`c${index}`, `${index}:`.padEnd(size, "x"))]).flat(),
];

const summaries: string[] = [];
const summarize = async (transcript: string) => {
  summaries.push(transcript);
  return `summary ${summaries.length}`;
};

test("leaves input alone while it fits", async () => {
  const items = history(3, 100);
  expect(await createCompactor({ contextTokens: 100_000, summarize })(items)).toBe(items);
});

test("trims old tool results before summarizing", async () => {
  summaries.length = 0;
  const events: unknown[] = [];
  const items = history(10, 8_000); // ~20k tokens
  const compacted = await createCompactor({ contextTokens: 20_000, summarize, onCompact: (event) => events.push(event) })(items);

  expect(summaries).toHaveLength(0);
  expect(compacted).toHaveLength(items.length);
  expect((compacted[2] as { output: string }).output).toContain("[output trimmed: 8000 chars]");
  expect(compacted.at(-1)).toEqual(items.at(-1)!); // the recent tail stays verbatim
  expect(estimateTokens(compacted)).toBeLessThan(15_000);
  expect(events).toMatchObject([{ summarized: false }]);
});

test("summarizes the head, keeps the task and an unbroken tail, and reuses the summary", async () => {
  summaries.length = 0;
  const compact = createCompactor({ contextTokens: 8_000, summarize });
  const items = history(40, 1_500);
  const compacted = await compact(items);

  expect(summaries).toHaveLength(1);
  expect(summaries[0]).toContain("Fix the build.");
  // Not toMatchObject + stringContaining: Bun writes the matcher back into the object.
  expect((compacted[0] as { role: string }).role).toBe("user");
  expect((compacted[0] as { content: string }).content).toContain("summary 1");
  expect(compacted[1]).toEqual(user("Fix the build."));
  // The tail never starts on a result whose call was summarized away.
  expect((compacted[2] as { type: string }).type).toBe("function_call");
  expect(estimateTokens(compacted)).toBeLessThan(6_000);

  // The next turn adds an item; the earlier summary is reused rather than redone.
  const next = await compact([...items, assistant("Done.")]);
  expect(summaries).toHaveLength(1);
  expect(next.slice(0, 2)).toEqual(compacted.slice(0, 2));
  expect(next.at(-1)).toEqual(assistant("Done."));

  // Growing past the window again folds the old summary into a new one.
  await compact([...items, ...history(40, 1_500).slice(1).map((item) => ({ ...item, callId: `n${(item as { callId: string }).callId}` }) as AgentInputItem)]);
  expect(summaries).toHaveLength(2);
  expect(summaries[1]).toContain("summary 1");
});

test("counts instructions and tool definitions against the window", async () => {
  summaries.length = 0;
  const items = history(10, 1_500); // ~4k tokens: fits 8k on its own
  const compact = createCompactor({ contextTokens: 8_000, summarize });
  expect(await compact(items)).toBe(items);
  // 4k tokens of instructions and tools leave no room for it.
  expect(estimateTokens(await compact(items, 4_000))).toBeLessThan(2_000);
});

test("trims recent tool results when the tail alone overflows", async () => {
  summaries.length = 0;
  const items = history(3, 30_000); // three results of about a full 8k window each
  const compacted = await createCompactor({ contextTokens: 8_000, summarize })(items);
  expect(estimateTokens(compacted)).toBeLessThan(6_000);
});
