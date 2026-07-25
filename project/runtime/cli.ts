import { runAgent } from "./openai-agents";

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

try {
  console.log(
    await runAgent({
      task: required("SWEAT_AGENT_TASK"),
      instructions: required("SWEAT_AGENT_INSTRUCTIONS"),
      agentId: required("SWEAT_AGENT_ID"),
      model: {
        baseUrl: required("SWEAT_MODEL_BASE_URL"),
        apiKey: required("SWEAT_MODEL_API_KEY"),
        model: required("SWEAT_MODEL_NAME"),
      },
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
