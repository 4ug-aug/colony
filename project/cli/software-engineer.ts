import { createSoftwareEngineerExecutor } from "../composition/software-engineer";
import { createGitHubRepositoryCheckoutSource } from "../inputs/github";
import { createGitHubCliClient, createGitHubMcpUpstream } from "../mcp/github";
import { createMcpGateway } from "../mcp/gateway";
import { createMcpGatewayHttpServer } from "../mcp/http";
import { createLinearMcpUpstream } from "../mcp/linear";
import { createCapabilitySessionFactory } from "../mcp/session";
import { softwareEngineerRole } from "../roles/software-engineer";

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const capabilityTools = (id: string): readonly string[] =>
  softwareEngineerRole.requestedCapabilities.find((capability) => capability.id === id)?.tools ?? [];

const task = Bun.argv.slice(2).join(" ").trim();
if (!task) throw new Error('Usage: bun run agent:software-engineer -- "task"');

const linearAccessToken = Bun.env.LINEAR_MCP_API_KEY;
const githubRepository = Bun.env.SWEAT_GITHUB_REPOSITORY;
const githubBase = Bun.env.SWEAT_GITHUB_BASE ?? "main";
const github = githubRepository ? await createGitHubCliClient() : undefined;
const grantedTools = [
  ...(linearAccessToken ? capabilityTools("linear.issues") : []),
  ...(github ? capabilityTools("github.pull-requests") : []),
];
const capabilityUrl = (url: string): string => url.replace(
  "http://0.0.0.0",
  Bun.env.SWEAT_MCP_HOST ?? "http://host.container.internal",
);
const capabilities = grantedTools.length
  ? createCapabilitySessionFactory({
      createGateway: ({ grant, workspace }) => {
        const upstreams = [];
        if (linearAccessToken) upstreams.push(createLinearMcpUpstream({ accessToken: linearAccessToken }));
        if (github && githubRepository) {
          const githubScope = grant.resources?.find((resource) => resource.provider === "github");
          if (githubScope?.repository !== githubRepository || workspace?.git?.repository !== githubRepository) {
            throw new Error("GitHub grant and prepared repository must match");
          }
          upstreams.push(createGitHubMcpUpstream({
            octokit: github,
            repository: githubRepository,
            workspace: workspace.path,
            branch: workspace.git.branch,
            baseCommit: workspace.git.baseCommit,
            base: githubBase,
          }));
        }
        return createMcpGateway({ upstreams });
      },
      createEndpoint: (gateway) => {
        const server = createMcpGatewayHttpServer({ gateway, hostname: "0.0.0.0" });
        return { url: capabilityUrl(server.url), close: server.close };
      },
    })
  : undefined;

const executor = createSoftwareEngineerExecutor({
  image: Bun.env.SWEAT_AGENT_IMAGE ?? "sweat-agent:latest",
  model: {
    baseUrl: required("LLM_BASE_URL"),
    apiKey: required("LLM_API_KEY"),
    model: required("LLM_MODEL"),
  },
  ...(github ? { repositorySources: [createGitHubRepositoryCheckoutSource({ octokit: github })] } : {}),
  ...(capabilities ? { capabilities } : {}),
});
const id = executor.startRun({
  agentDefinitionId: "software-engineer",
  task,
  ...(githubRepository ? {
    inputs: [{ type: "repository" as const, provider: "github", repository: githubRepository, revision: githubBase }],
  } : {}),
  ...(grantedTools.length ? {
    capabilityGrant: {
      tools: grantedTools,
      ...(githubRepository ? { resources: [{ provider: "github", repository: githubRepository }] } : {}),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  } : {}),
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
