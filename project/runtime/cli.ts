import { runAgent } from "./openai-agents";

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

try {
  console.log(
    await runAgent({
      prompt: required("SWEAT_AGENT_PROMPT"),
      role: required("SWEAT_AGENT_ROLE") as "software-engineer",
      model: {
        baseUrl: required("SWEAT_MODEL_BASE_URL"),
        apiKey: required("SWEAT_MODEL_API_KEY"),
        model: required("SWEAT_MODEL_NAME"),
      },
      mcp: Bun.env.SWEAT_MCP_URL && Bun.env.SWEAT_MCP_TOKEN
        ? {
            url: Bun.env.SWEAT_MCP_URL,
            token: Bun.env.SWEAT_MCP_TOKEN,
            allowedTools: Bun.env.SWEAT_MCP_ALLOWED_TOOLS?.split(","),
          }
        : undefined,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
