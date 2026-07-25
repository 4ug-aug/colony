import { createSoftwareEngineerExecutor } from "../composition/software-engineer";
import { softwareEngineerRole } from "../roles/software-engineer";
import { createLinearMcpGateway } from "../mcp/linear";
import { createMcpGatewayHttpServer } from "../mcp/http";
import { createCapabilitySessionFactory } from "../mcp/session";

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const task = Bun.argv.slice(2).join(" ").trim();
if (!task) throw new Error('Usage: bun run agent:software-engineer -- "task"');

const linearGateway = Bun.env.LINEAR_MCP_API_KEY
  ? createLinearMcpGateway({ accessToken: Bun.env.LINEAR_MCP_API_KEY })
  : undefined;
const capabilityServer = linearGateway
  ? createMcpGatewayHttpServer({
      gateway: linearGateway,
      hostname: "0.0.0.0",
    })
  : undefined;
const capabilityUrl = capabilityServer?.url.replace(
  "http://0.0.0.0",
  Bun.env.SWEAT_MCP_HOST ?? "http://host.container.internal",
);

try {
  const executor = createSoftwareEngineerExecutor({
    image: Bun.env.SWEAT_AGENT_IMAGE ?? "sweat-agent:latest",
    model: {
      baseUrl: required("LLM_BASE_URL"),
      apiKey: required("LLM_API_KEY"),
      model: required("LLM_MODEL"),
    },
    capabilities: capabilityServer && capabilityUrl
      ? createCapabilitySessionFactory({
          gateway: linearGateway!,
          url: capabilityUrl,
        })
      : undefined,
  });
  const linearTools = softwareEngineerRole.requestedCapabilities.find(
    (capability) => capability.id === "linear.issues",
  )?.tools ?? [];
  const id = executor.startRun({
    agentDefinitionId: "software-engineer",
    task,
    ...(capabilityServer
      ? {
          capabilityGrant: {
            tools: linearTools,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          },
        }
      : {}),
  });

  let result;
  while ((result = executor.getRun(id)) && !["succeeded", "failed", "cancelled"].includes(result.state)) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (!result) throw new Error(`Run disappeared: ${id}`);

  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) process.stderr.write(`${result.error}\n`);
  process.exitCode = result.state === "succeeded" ? 0 : 1;
} finally {
  await capabilityServer?.close();
}
