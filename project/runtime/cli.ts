import { serializeStep } from "./step";
import { runAgent } from "./openai-agents";

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const modelProvider = (): "openai" | "custom" => {
  const value = Bun.env.SWEAT_MODEL_PROVIDER ?? "openai";
  if (value !== "openai" && value !== "custom") {
    throw new Error("SWEAT_MODEL_PROVIDER must be openai or custom");
  }
  return value;
};

try {
  const apiKey = required("SWEAT_MODEL_API_KEY");
  delete Bun.env.SWEAT_MODEL_API_KEY;
  delete process.env.SWEAT_MODEL_API_KEY;

  await runAgent(
    {
      task: required("SWEAT_AGENT_TASK"),
      instructions: required("SWEAT_AGENT_INSTRUCTIONS"),
      agentId: required("SWEAT_AGENT_ID"),
      model: {
        provider: modelProvider(),
        baseUrl: required("SWEAT_MODEL_BASE_URL"),
        apiKey,
        model: required("SWEAT_MODEL_NAME"),
      },
      capabilitySession: Bun.env.SWEAT_MCP_URL && Bun.env.SWEAT_MCP_TOKEN
        ? {
            url: Bun.env.SWEAT_MCP_URL,
            token: Bun.env.SWEAT_MCP_TOKEN,
            allowedTools: Bun.env.SWEAT_MCP_ALLOWED_TOOLS?.split(",") ?? [],
            expiresAt: new Date(0),
            revoke: () => {},
          }
        : undefined,
    },
    {
      onStep: (step) => process.stdout.write(serializeStep(step) + "\n"),
    },
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
