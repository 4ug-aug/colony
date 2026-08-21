import { expect, test } from "bun:test";
import { createOpenAIGrantPicker, parsePickedNames } from "./grant-tools-model";

const model = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test-key",
  model: "test-model",
};

test("parsePickedNames accepts names or tools and drops unknown ids", () => {
  expect(
    parsePickedNames(
      '{"names":["workspace.get_issue","nope"]}',
      ["workspace.get_issue"],
    ),
  ).toEqual(["workspace.get_issue"]);
  expect(
    parsePickedNames(
      'Sure.\n{"tools":["github.compare"]}',
      ["github.compare"],
    ),
  ).toEqual(["github.compare"]);
});

test("OpenAI grant picker calls the SDK path with no tools", async () => {
  let seen: {
    model: { model: string };
    messages: readonly { role: string; content: string }[];
  } | undefined;
  const pick = createOpenAIGrantPicker(() => model, async (input) => {
    seen = input;
    return '{"names":["workspace.get_issue"]}';
  });
  const names = await pick({
    task: "read SWE-1",
    names: ["workspace.get_issue", "github.compare"],
    listing: "workspace.get_issue: Get issues\ngithub.compare: Compare refs",
  });
  expect(names).toEqual(["workspace.get_issue"]);
  expect(seen?.model.model).toBe("test-model");
  expect(seen?.messages).toHaveLength(2);
  expect(seen?.messages[0]?.content).toContain("You have no tools");
  expect(seen).not.toHaveProperty("tools");
});
