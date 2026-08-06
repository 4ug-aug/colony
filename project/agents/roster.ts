import {
  createRunExecutor,
  type RunExecutor,
  type StartRunRequest,
  type PreparedWorkspace,
} from "../runs";
import {
  type AgentDefinition,
  type AgentRuntimeKind,
  type CursorRuntimeConfig,
} from "./definition";
import type { AgentGrantContext } from "./grant-context";
import {
  createRepositoryWorkspaceProvisioner,
  type AttachmentInput,
  type AttachmentSource,
  type RepositoryCheckoutSource,
  type RepositoryInput,
  type SkillSource,
  type WorkspaceInput,
} from "../inputs/repository";
import { createRoutingAgentRuntime } from "../providers/routing-agent-runtime";
import type { AgentRole } from "../roles/role";
import type { OpenAICompatibleModel } from "../runtime/openai-agents";
import { createCapabilitySessionFactory } from "../mcp/session";
import {
  createMcpGateway,
  type McpGrant,
  type McpUpstream,
} from "../mcp/gateway";
import type { Sandbox, SandboxProvider } from "../sandboxes";
import {
  SOFTWARE_ENGINEER_ID,
  WORKSPACE_ROSTER,
  rosterNotConfiguredMessage,
} from "./roster-meta";

export * from "./roster-meta";

const defaultLimits = {
  maxDurationMs: 30 * 60 * 1000,
  maxOutputBytes: 1024 * 1024,
  maxSteps: 500,
};

interface AgentCapabilityContext {
  workspace?: PreparedWorkspace;
  sandbox?: Pick<Sandbox, "exec">;
  grantContext?: AgentGrantContext;
}

/**
 * Eligibility is decided before a workspace or sandbox exists, so `applies`
 * sees only the grant context. Gate on prepared inputs in `createUpstream`.
 */
type AgentEligibilityContext = Pick<AgentCapabilityContext, "grantContext">;

export interface WorkspaceAgentAdapter {
  repository?: {
    input: RepositoryInput;
    source: RepositoryCheckoutSource;
  };
  capability?: {
    id: string;
    resources?: McpGrant["resources"];
    applies?(context: AgentEligibilityContext): boolean;
    createUpstream(context: AgentCapabilityContext): McpUpstream;
  };
}

export type WorkspaceAgentStartRunRequest = Omit<
  StartRunRequest<WorkspaceInput>,
  "agentDefinitionId" | "definitionId" | "inputs" | "capabilityGrant"
> & {
  attachments?: readonly AttachmentInput[];
  agentDefinitionId?: string;
};

export type WorkspaceAgentExecutor = Omit<
  RunExecutor<WorkspaceInput>,
  "startRun"
> & {
  startRun(request: WorkspaceAgentStartRunRequest): string;
};

function personCapabilities(role: AgentRole): Map<string, readonly string[]> {
  return new Map(
    role.requestedCapabilities.map((capability) => [
      capability.id,
      capability.tools,
    ]),
  );
}

/**
 * Workspace roster executor: software-engineer (cursor + repo) and antboy
 * (openai-agents, no repo).
 */
export function createWorkspaceAgentsExecutor(options: {
  model?: () => OpenAICompatibleModel;
  cursor?: () => CursorRuntimeConfig;
  /** Explicit Bun/OpenAI Agents image for antboy. */
  image?: string;
  /** Explicit Cursor agent image for software-engineer. */
  cursorImage?: string;
  adapters?: readonly WorkspaceAgentAdapter[];
  createCapabilityEndpoint?: (gateway: ReturnType<typeof createMcpGateway>) => {
    url: string;
    close(): Promise<void>;
  };
  sandboxProvider: SandboxProvider;
  attachmentSource?: AttachmentSource;
  skillSource?: SkillSource;
}): WorkspaceAgentExecutor {
  const adapters = options.adapters ?? [];
  const repositories = adapters.flatMap((adapter) =>
    adapter.repository ? [adapter.repository] : [],
  );
  if (repositories.length > 1) {
    throw new Error("A workspace roster currently supports one repository adapter");
  }
  const capabilityAdapters = adapters.flatMap((adapter) =>
    adapter.capability ? [adapter.capability] : [],
  );

  const openaiImage =
    options.image ?? Bun.env.SWEAT_AGENT_IMAGE ?? "sweat-agent:latest";
  const cursorImage =
    options.cursorImage ??
    Bun.env.SWEAT_CURSOR_AGENT_IMAGE ??
    "sweat-agent-cursor:latest";

  const imagesByKind: Record<AgentRuntimeKind, string> = {
    cursor: cursorImage,
    "openai-agents": openaiImage,
  };

  const byId = new Map(
    WORKSPACE_ROSTER.map((person) => [person.id, person] as const),
  );
  const allRequested = new Map(
    WORKSPACE_ROSTER.map((person) => [
      person.id,
      personCapabilities(person.role),
    ] as const),
  );
  const unionRequested = new Map<string, readonly string[]>();
  for (const requested of allRequested.values()) {
    for (const [id, tools] of requested) {
      if (!unionRequested.has(id)) unionRequested.set(id, tools);
    }
  }

  const capabilityIds = new Set<string>();
  capabilityAdapters.forEach((adapter) => {
    if (capabilityIds.has(adapter.id)) {
      throw new Error(`Duplicate workspace agent capability adapter: ${adapter.id}`);
    }
    capabilityIds.add(adapter.id);
    if (!unionRequested.has(adapter.id)) {
      throw new Error(`No roster person requested capability: ${adapter.id}`);
    }
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
          `Workspace agent capability ${capability.id} requires its repository adapter`,
        );
      }
    }
  }
  if (capabilityAdapters.length && !options.createCapabilityEndpoint) {
    throw new Error("A capability endpoint is required for workspace agent adapters");
  }
  if (!options.model && !options.cursor) {
    throw new Error(
      "Workspace agents executor requires an OpenAI model and/or Cursor runtime config",
    );
  }

  const eligibleAdapters = (
    agentDefinitionId: string,
    grantContext: AgentGrantContext | undefined,
  ) => {
    const requested = allRequested.get(agentDefinitionId);
    if (!requested) return [];
    return capabilityAdapters.filter((adapter) => {
      if (!requested.has(adapter.id)) return false;
      return adapter.applies ? adapter.applies({ grantContext }) : true;
    });
  };

  const capabilities = capabilityAdapters.length
    ? createCapabilitySessionFactory({
        // Same eligibility decision as startRun, from the same function, so the
        // gateway can never expose an upstream the person did not request.
        createGateway: (context) => {
          const eligible = eligibleAdapters(
            context.grantContext?.agentDefinitionId ?? SOFTWARE_ENGINEER_ID,
            context.grantContext,
          );
          return createMcpGateway({
            upstreams: eligible.map((adapter) =>
              adapter.createUpstream({
                workspace: context.workspace,
                sandbox: context.sandbox,
                grantContext: context.grantContext,
              }),
            ),
          });
        },
        createEndpoint: options.createCapabilityEndpoint!,
      })
    : undefined;

  const executor = createRunExecutor<WorkspaceInput>({
    definitions: {
      resolve(id) {
        const person = byId.get(id);
        if (!person) return undefined;
        const image = imagesByKind[person.kind];
        if (person.kind === "cursor") {
          if (!options.cursor) return undefined;
          return {
            id: person.id,
            instructions: person.role.instructions,
            requestedCapabilities: person.role.requestedCapabilities,
            runtime: {
              kind: "cursor",
              image,
              cursor: options.cursor(),
            },
            executionPolicy: defaultLimits,
          } satisfies AgentDefinition;
        }
        if (!options.model) return undefined;
        return {
          id: person.id,
          instructions: person.role.instructions,
          requestedCapabilities: person.role.requestedCapabilities,
          runtime: {
            kind: "openai-agents",
            image,
            model: options.model(),
          },
          executionPolicy: defaultLimits,
        } satisfies AgentDefinition;
      },
    },
    sandboxes: options.sandboxProvider,
    runtime: createRoutingAgentRuntime({}),
    capabilities,
    inputs: createRepositoryWorkspaceProvisioner({
      sources: repositories.map((repository) => repository.source),
      attachmentSource: options.attachmentSource,
      skillSource: options.skillSource,
    }),
  });

  return {
    ...executor,
    startRun(request) {
      const {
        attachments = [],
        task,
        agentDefinitionId = SOFTWARE_ENGINEER_ID,
        ...runRequest
      } = request;
      const person = byId.get(agentDefinitionId);
      if (!person) {
        throw new Error(`Unknown agent definition: ${agentDefinitionId}`);
      }
      if (person.kind === "cursor" && !options.cursor) {
        throw new Error(rosterNotConfiguredMessage("cursor"));
      }
      if (person.kind === "openai-agents" && !options.model) {
        throw new Error(rosterNotConfiguredMessage("openai-agents"));
      }

      const grantContext: AgentGrantContext = {
        ...(runRequest.grantContext ?? {}),
        agentDefinitionId,
      };
      const eligible = eligibleAdapters(agentDefinitionId, grantContext);

      const requested = allRequested.get(agentDefinitionId)!;
      const eligibleTools = eligible.flatMap(
        (adapter) => requested.get(adapter.id) ?? [],
      );
      const attachmentNote = attachments.length
        ? `\n\nAttachments (inspect these paths before acting):\n${attachments
            .map(
              (attachment) =>
                `- ${attachment.filename}: /work/.sweat/attachments/${attachment.id}/${attachment.filename}`,
            )
            .join("\n")}`
        : "";
      const repoInputs = person.includeRepository
        ? repositories.map((repository) => repository.input)
        : [];
      return executor.startRun({
        ...runRequest,
        grantContext,
        task: `${task}${attachmentNote}`,
        agentDefinitionId,
        inputs: [...repoInputs, ...attachments],
        ...(eligible.length
          ? {
              capabilityGrant: {
                tools: eligibleTools,
                resources: eligible.flatMap(
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
