import type { AgentInputItem } from "@openai/agents";

/** Compact once the estimated request passes this share of the context window. */
const COMPACT_AT = 0.75;
/** Most recent items always sent verbatim. */
const KEEP_RECENT = 6;
/** Older tool results are cut to this many characters. */
const OLD_RESULT_CHARS = 2_000;

export const SUMMARY_INSTRUCTIONS =
  "You compact an agent's working context. Summarize the transcript below so the agent can continue without it: the user's requests, decisions made, what was done and found (files, commands, ids, values), and what remains. Be specific and concise. Reply with the summary only.";

export type CompactionEvent = { beforeTokens: number; afterTokens: number; summarized: boolean };

// ponytail: chars/4 estimate, not a tokenizer; COMPACT_AT leaves the slack for its error.
export const estimateTokens = (items: readonly AgentInputItem[]): number =>
  Math.ceil(JSON.stringify(items).length / 4);

type Item = Record<string, unknown>;

const isResult = (item: AgentInputItem) => (item as Item).type === "function_call_result";
const isUser = (item: AgentInputItem) => (item as Item).role === "user";

function outputText(output: unknown): string {
  if (typeof output === "string") return output;
  if (output && typeof output === "object" && "text" in output && typeof output.text === "string")
    return output.text;
  if (Array.isArray(output))
    return output.map((part) => (part?.type === "input_text" ? part.text : `[${part?.type ?? "part"}]`)).join("\n");
  return JSON.stringify(output) ?? "";
}

function trimResult(item: AgentInputItem, limit: number): AgentInputItem {
  if (!isResult(item)) return item;
  const text = outputText((item as Item).output);
  if (text.length <= limit) return item;
  return {
    ...item,
    output: `${text.slice(0, limit)}\n[output trimmed: ${text.length} chars]`,
  } as AgentInputItem;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
  return "";
}

/** Plain-text transcript, so the summary call works on any Responses-compatible backend. */
export function transcript(items: readonly AgentInputItem[], maxChars: number): string {
  const lines = items.flatMap((value) => {
    const item = value as Item;
    if (item.role === "user" || item.role === "assistant" || item.role === "system")
      return [`${item.role}: ${contentText(item.content)}`];
    if (item.type === "function_call") return [`tool call ${item.name}: ${item.arguments}`];
    if (item.type === "function_call_result")
      return [`tool result ${item.name ?? ""}: ${outputText(item.output).slice(0, OLD_RESULT_CHARS)}`];
    return [];
  });
  const text = lines.join("\n\n");
  if (text.length <= maxChars) return text;
  // Keep the start (task, any earlier summary) and the most recent work; drop the middle.
  const start = Math.floor(maxChars / 4);
  return `${text.slice(0, start)}\n\n[transcript omitted]\n\n${text.slice(start - maxChars)}`;
}

/** First index of the verbatim tail; never splits a tool call from its result or reasoning. */
function tailStart(items: readonly AgentInputItem[]): number {
  let cut = Math.max(0, items.length - KEEP_RECENT);
  while (cut > 0 && (isResult(items[cut]!) || (items[cut - 1] as Item).type === "reasoning")) cut -= 1;
  return cut;
}

/**
 * Returns a compactor that keeps model input under the context window.
 * It trims old tool results first and only summarizes when that is not enough.
 * Summaries are remembered across calls, so a long run summarizes once per overflow, not every turn.
 */
export function createCompactor(options: {
  contextTokens: number;
  summarize: (transcript: string) => Promise<string>;
  onCompact?: (event: CompactionEvent) => void;
}) {
  const limit = options.contextTokens * COMPACT_AT;
  // Any single result is capped at about a quarter of the window (chars/4 = tokens).
  const maxResultChars = options.contextTokens;
  let trimReported = false;
  let done: { cut: number; marker: string; replacement: AgentInputItem[] } | undefined;

  return async (items: AgentInputItem[]): Promise<AgentInputItem[]> => {
    const beforeTokens = estimateTokens(items);
    if (beforeTokens <= limit && !done) return items;

    const keepFrom = tailStart(items);
    // Trimmed before the cache check so the cached cut lines up with the same items.
    const trimmed = items.map((item, index) =>
      trimResult(item, index < keepFrom ? OLD_RESULT_CHARS : maxResultChars),
    );
    const reused =
      done && JSON.stringify(trimmed[done.cut - 1]) === done.marker ? done : undefined;
    let working = reused ? [...reused.replacement, ...trimmed.slice(reused.cut)] : trimmed;

    let summarized = false;
    if (estimateTokens(working) > limit) {
      const fromCut = reused?.cut ?? 0;
      const cut = tailStart(trimmed);
      if (cut > fromCut) {
        const head = [...(reused?.replacement ?? []), ...trimmed.slice(fromCut, cut)];
        const summary = await options.summarize(transcript(head, options.contextTokens * 2));
        const task = trimmed.slice(0, cut).findLast(isUser);
        const replacement = [
          {
            role: "user",
            content: `Earlier context was compacted. Summary of the conversation and work so far:\n\n${summary}`,
          } as AgentInputItem,
          ...(task ? [task] : []),
        ];
        done = { cut, marker: JSON.stringify(trimmed[cut - 1]), replacement };
        working = [...replacement, ...trimmed.slice(cut)];
        summarized = true;
      }
    }

    const afterTokens = estimateTokens(working);
    if (summarized || (!trimReported && afterTokens < beforeTokens)) {
      trimReported = true;
      options.onCompact?.({ beforeTokens, afterTokens, summarized });
    }
    return working;
  };
}
