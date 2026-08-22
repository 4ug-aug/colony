import OpenAI from "openai";
import type { OpenAICompatibleModel } from "../runtime/openai-agents";
import { normalizeModelBaseUrl } from "../runtime/openai-agents";
import type { PickGrantedNames } from "./grant-tools";

const SYSTEM = `You assign tools to an agent for one request.
You have no tools. Do not call tools. Do not explain.
Reply JSON only: {"names":["id"]}. Use only listed names.
Prefer a bundle name when the whole group is needed.
Smallest set that can complete the task.`;

export type GrantPickerComplete = (input: {
  model: OpenAICompatibleModel;
  messages: readonly { role: "system" | "user"; content: string }[];
}) => Promise<string>;

const defaultComplete: GrantPickerComplete = async ({ model, messages }) => {
  const client = new OpenAI({
    apiKey: model.apiKey,
    baseURL: normalizeModelBaseUrl(model.baseUrl),
    timeout: 15_000,
  });
  const completion = await client.chat.completions.create({
    model: model.model,
    temperature: 0,
    max_tokens: 256,
    messages: [...messages],
    response_format: { type: "json_object" },
  });
  return completion.choices[0]?.message?.content ?? "";
};

export function parsePickedNames(
  content: string,
  allowed: readonly string[],
): string[] {
  const trimmed = content.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : (trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed);
  const parsed: unknown = JSON.parse(jsonText);
  const names =
    parsed &&
    typeof parsed === "object" &&
    "names" in parsed &&
    Array.isArray((parsed as { names: unknown }).names)
      ? (parsed as { names: unknown[] }).names
      : undefined;
  if (!names || !names.every((name) => typeof name === "string")) {
    throw new Error("Grant picker returned invalid JSON");
  }
  const allowedSet = new Set(allowed);
  return names.filter((name) => allowedSet.has(name));
}

/**
 * Host-side OpenAI SDK classifier. No tools, no sandbox, no agent runtime.
 */
export function createOpenAIGrantPicker(
  model: () => OpenAICompatibleModel,
  complete: GrantPickerComplete = defaultComplete,
): PickGrantedNames {
  return async ({ task, names, listing }) => {
    const allowed = [...names];
    const content = await complete({
      model: model(),
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Task:\n${task.slice(0, 4000)}\n\nNames:\n${listing}`,
        },
      ],
    });
    return parsePickedNames(content, allowed);
  };
}
