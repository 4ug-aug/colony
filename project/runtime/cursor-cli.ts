import { describeError } from "./error.ts";
import { serializeStep } from "./step.ts";
import {
  runCursorAgentPersisted,
  takeCursorApiKeyFromEnv,
} from "./cursor-sdk.ts";

const SESSION_PATH = "/tmp/sweat-cursor-agent-id";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

try {
  // Transport key into memory, then scrub env before any SDK/shell work.
  const apiKey = takeCursorApiKeyFromEnv(process.env);

  await runCursorAgentPersisted(
    {
      task: required("SWEAT_AGENT_TASK"),
      instructions: required("SWEAT_AGENT_INSTRUCTIONS"),
      agentId: required("SWEAT_AGENT_ID"),
      apiKey,
      model: required("SWEAT_CURSOR_MODEL"),
      cwd: "/work",
      capabilitySession:
        process.env.SWEAT_MCP_URL && process.env.SWEAT_MCP_TOKEN
          ? {
              url: process.env.SWEAT_MCP_URL,
              token: process.env.SWEAT_MCP_TOKEN,
              allowedTools:
                process.env.SWEAT_MCP_ALLOWED_TOOLS?.split(",").filter(Boolean) ??
                [],
            }
          : undefined,
    },
    SESSION_PATH,
    {
      onStep: (step) => process.stdout.write(serializeStep(step) + "\n"),
    },
  );
} catch (error) {
  console.error(describeError(error));
  process.exit(1);
}
