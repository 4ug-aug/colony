import { createSoftwareEngineerExecutor } from "../agents/software-engineer";
import {
  createGitHubSoftwareEngineerAdapter,
  createLinearSoftwareEngineerAdapter,
} from "../agents/software-engineer-adapters";
import { createGitHubCliClient } from "../mcp/github";
import { createMcpGatewayHttpServer } from "../mcp/http";

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const task = Bun.argv.slice(2).join(" ").trim();
if (!task) throw new Error('Usage: bun run agent:software-engineer -- "task"');

const linearAccessToken = Bun.env.LINEAR_MCP_API_KEY;
const githubRepository = Bun.env.SWEAT_GITHUB_REPOSITORY;
const githubBase = Bun.env.SWEAT_GITHUB_BASE ?? "main";
const github = githubRepository ? await createGitHubCliClient() : undefined;
const verificationCommand = Bun.env.SWEAT_VERIFY_COMMAND;
const capabilityUrl = (url: string): string =>
  url.replace(
    "http://0.0.0.0",
    Bun.env.SWEAT_MCP_HOST ?? "http://host.container.internal",
  );

const executor = createSoftwareEngineerExecutor({
  image: Bun.env.SWEAT_AGENT_IMAGE ?? "sweat-agent:latest",
  model: {
    baseUrl: required("LLM_BASE_URL"),
    apiKey: required("LLM_API_KEY"),
    model: required("LLM_MODEL"),
  },
  adapters: [
    ...(linearAccessToken
      ? [
          createLinearSoftwareEngineerAdapter({
            accessToken: linearAccessToken,
          }),
        ]
      : []),
    ...(github && githubRepository
      ? [
          createGitHubSoftwareEngineerAdapter({
            octokit: github,
            repository: githubRepository,
            base: githubBase,
            verifyCommand: verificationCommand,
          }),
        ]
      : []),
  ],
  createCapabilityEndpoint: (gateway) => {
    const server = createMcpGatewayHttpServer({ gateway, hostname: "0.0.0.0" });
    return { url: capabilityUrl(server.url), close: server.close };
  },
});
const id = executor.startRun({
  task,
});

let result;
while (
  (result = executor.getRun(id)) &&
  !["succeeded", "failed", "cancelled"].includes(result.state)
) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
if (!result) throw new Error(`Run disappeared: ${id}`);

process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) process.stderr.write(`${result.error}\n`);
process.exitCode = result.state === "succeeded" ? 0 : 1;
