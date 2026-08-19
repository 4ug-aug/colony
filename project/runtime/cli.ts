import { describeError } from "./error";
import { serializeStep } from "./step";
import {
  loadOpenAIAgentSession,
  runAgent,
  saveOpenAIAgentSession,
} from "./openai-agents";

const SESSION_PATH = "/tmp/sweat-openai-session.json";

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
  const mcpUrl = Bun.env.SWEAT_MCP_URL;
  const mcpToken = Bun.env.SWEAT_MCP_TOKEN;
  const mcpAllowedTools = Bun.env.SWEAT_MCP_ALLOWED_TOOLS?.split(",") ?? [];
  // Scrub secrets before the SDK sandbox shell can inherit process env.
  delete Bun.env.SWEAT_MODEL_API_KEY;
  delete process.env.SWEAT_MODEL_API_KEY;
  delete Bun.env.SWEAT_MCP_TOKEN;
  delete process.env.SWEAT_MCP_TOKEN;
  delete Bun.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const session = await loadOpenAIAgentSession(SESSION_PATH);
  try {
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
        capabilitySession: mcpUrl && mcpToken
          ? {
              url: mcpUrl,
              token: mcpToken,
              allowedTools: mcpAllowedTools,
              expiresAt: new Date(0),
              revoke: () => {},
            }
          : undefined,
        skillsRoot: Bun.env.SWEAT_SKILLS_ROOT,
      },
      {
        session,
        onStep: (step) => process.stdout.write(serializeStep(step) + "\n"),
      },
    );
  } finally {
    await saveOpenAIAgentSession(SESSION_PATH, session);
  }
} catch (error) {
  console.error(describeError(error));
  process.exit(1);
}
