import {
  createRunExecutor,
  type RunExecutor,
  type StartRunRequest,
  type PreparedWorkspace,
} from "../runs";
import {
  createInMemoryAgentDefinitionResolver,
  type AgentDefinition,
} from "./definition";
import {
  createRepositoryWorkspaceProvisioner,
  type RepositoryCheckoutSource,
  type RepositoryInput,
} from "../inputs/repository";
import { createAppleContainerSandboxProvider } from "../providers/apple-container-sandbox";
import { createOpenAIAgentsRuntime } from "../providers/openai-agents-runtime";
import { softwareEngineerRole } from "../roles/software-engineer";
import {
  createAppleContainerClient,
  type AppleContainerClient,
} from "../sdk/src";
import type { OpenAICompatibleModel } from "../runtime/openai-agents";
import { createCapabilitySessionFactory } from "../mcp/session";
import {
  createMcpGateway,
  type McpGrant,
  type McpUpstream,
} from "../mcp/gateway";
import type { Sandbox } from "../sandboxes";

const defaultLimits = {
  maxDurationMs: 30 * 60 * 1000,
  maxOutputBytes: 1024 * 1024,
  maxSteps: 500,
};

interface SoftwareEngineerCapabilityContext {
  workspace?: PreparedWorkspace;
  sandbox?: Pick<Sandbox, "exec">;
  grantContext?: unknown;
}

export interface SoftwareEngineerAdapter {
  repository?: {
    input: RepositoryInput;
    source: RepositoryCheckoutSource;
  };
  capability?: {
    id: string;
    resources?: McpGrant["resources"];
    createUpstream(context: SoftwareEngineerCapabilityContext): McpUpstream;
  };
}

export type SoftwareEngineerStartRunRequest = Omit<
  StartRunRequest<RepositoryInput>,
  "agentDefinitionId" | "definitionId" | "inputs" | "capabilityGrant"
>;

export type SoftwareEngineerExecutor = Omit<
  RunExecutor<RepositoryInput>,
  "startRun"
> & {
  startRun(request: SoftwareEngineerStartRunRequest): string;
};

export function createSoftwareEngineerExecutor(options: {
  model: OpenAICompatibleModel;
  image?: string;
  adapters?: readonly SoftwareEngineerAdapter[];
  createCapabilityEndpoint?: (gateway: ReturnType<typeof createMcpGateway>) => {
    url: string;
    close(): Promise<void>;
  };
  container?: AppleContainerClient;
  createId?: () => string;
}): SoftwareEngineerExecutor {
  const container = options.container ?? createAppleContainerClient();
  const adapters = options.adapters ?? [];
  const repositories = adapters.flatMap((adapter) =>
    adapter.repository ? [adapter.repository] : [],
  );
  if (repositories.length > 1) {
    throw new Error(
      "A software engineer currently supports one repository adapter",
    );
  }
  const capabilityAdapters = adapters.flatMap((adapter) =>
    adapter.capability ? [adapter.capability] : [],
  );
  const requestedCapabilities = new Map(
    softwareEngineerRole.requestedCapabilities.map((capability) => [
      capability.id,
      capability.tools,
    ]),
  );
  const capabilityIds = new Set<string>();
  const tools = capabilityAdapters.flatMap((adapter) => {
    if (capabilityIds.has(adapter.id)) {
      throw new Error(
        `Duplicate software engineer capability adapter: ${adapter.id}`,
      );
    }
    capabilityIds.add(adapter.id);
    const requested = requestedCapabilities.get(adapter.id);
    if (!requested) {
      throw new Error(
        `Software engineer did not request capability: ${adapter.id}`,
      );
    }
    return requested;
  });
  for (const capability of capabilityAdapters) {
    for (const resource of capability.resources ?? []) {
      const repository = repositories[0]?.input;
      if (
        !repository ||
        repository.provider !== resource.provider ||
        repository.repository !== resource.repository
      ) {
        throw new Error(
          `Software engineer capability ${capability.id} requires its repository adapter`,
        );
      }
    }
  }
  if (capabilityAdapters.length && !options.createCapabilityEndpoint) {
    throw new Error(
      "A capability endpoint is required for software engineer adapters",
    );
  }
  const capabilities = capabilityAdapters.length
    ? createCapabilitySessionFactory({
        createGateway: (context) =>
          createMcpGateway({
            upstreams: capabilityAdapters.map((adapter) =>
              adapter.createUpstream(context),
            ),
          }),
        createEndpoint: options.createCapabilityEndpoint!,
      })
    : undefined;
  const definition: AgentDefinition = {
    id: softwareEngineerRole.id,
    instructions: softwareEngineerRole.instructions,
    requestedCapabilities: softwareEngineerRole.requestedCapabilities,
    runtime: {
      image: options.image ?? Bun.env.SWEAT_AGENT_IMAGE ?? "sweat-agent:latest",
      model: options.model,
    },
    executionPolicy: defaultLimits,
  };
  const executor = createRunExecutor<RepositoryInput>({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: createAppleContainerSandboxProvider({
      container,
      createId: options.createId,
    }),
    runtime: createOpenAIAgentsRuntime({}),
    capabilities,
    inputs: createRepositoryWorkspaceProvisioner({
      sources: repositories.map((repository) => repository.source),
    }),
  });
  return {
    ...executor,
    startRun(request) {
      return executor.startRun({
        ...request,
        agentDefinitionId: softwareEngineerRole.id,
        inputs: repositories.map((repository) => repository.input),
        ...(capabilityAdapters.length
          ? {
              capabilityGrant: {
                tools,
                resources: capabilityAdapters.flatMap(
                  (adapter) => adapter.resources ?? [],
                ),
                expiresAt: new Date(Date.now() + defaultLimits.maxDurationMs),
              },
            }
          : {}),
      });
    },
  };
}
