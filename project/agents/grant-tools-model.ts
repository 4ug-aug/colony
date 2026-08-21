import OpenAI from "openai";
import { z } from "zod";
import type { OpenAICompatibleModel } from "../runtime/openai-agents";
import { normalizeModelBaseUrl } from "../runtime/openai-agents";
import type { PickGrantedNames } from "./grant-tools";

const PickedTools = z.object({
  names: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
});

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
  const request = {
    model: model.model,
    temperature: 0,
    max_tokens: 256,
    messages: [...messages],
  };
  try {
    const completion = await client.chat.completions.create({
      ...request,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "granted_tools",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              names: { type: "array", items: { type: "string" } },
            },
            required: ["names"],
          },
        },
      },
    });
    return completion.choices[0]?.message?.content ?? "";
  } catch {
    // Custom OpenAI-compatible servers often lack json_schema.
    const completion = await client.chat.completions.create({
      ...request,
      response_format: { type: "json_object" },
    });
    return completion.choices[0]?.message?.content ?? "";
  }
};

export function parsePickedNames(
  content: string,
  allowed: readonly string[],
): string[] {
  const trimmed = content.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : (trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed);
  const parsed = PickedTools.safeParse(JSON.parse(jsonText));
  if (!parsed.success) throw new Error("Grant picker returned invalid JSON");
  const names = parsed.data.names ?? parsed.data.tools ?? [];
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
