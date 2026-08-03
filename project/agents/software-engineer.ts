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
import {
  createRepositoryWorkspaceProvisioner,
  type AttachmentInput,
  type AttachmentSource,
  type RepositoryCheckoutSource,
  type RepositoryInput,
  type WorkspaceInput,
} from "../inputs/repository";
import { createRoutingAgentRuntime } from "../providers/routing-agent-runtime";
import { antboyRole } from "../roles/antboy";
import { softwareEngineerRole } from "../roles/software-engineer";
import type { OpenAICompatibleModel } from "../runtime/openai-agents";
import { createCapabilitySessionFactory } from "../mcp/session";
import {
  createMcpGateway,
  type McpGrant,
  type McpUpstream,
} from "../mcp/gateway";
import type { Sandbox, SandboxProvider } from "../sandboxes";
import type { AgentRole } from "../roles/software-engineer";

export const SOFTWARE_ENGINEER_ID = softwareEngineerRole.id;
export const ANTBOY_ID = antboyRole.id;

const defaultLimits = {
  maxDurationMs: 30 * 60 * 1000,
  maxOutputBytes: 1024 * 1024,
  maxSteps: 500,
};

interface AgentCapabilityContext {
  workspace?: PreparedWorkspace;
  sandbox?: Pick<Sandbox, "exec">;
  grantContext?: unknown;
}

export interface WorkspaceAgentAdapter {
  repository?: {
    input: RepositoryInput;
    source: RepositoryCheckoutSource;
  };
  capability?: {
    id: string;
    resources?: McpGrant["resources"];
    applies?(context: AgentCapabilityContext): boolean;
    createUpstream(context: AgentCapabilityContext): McpUpstream;
  };
}

/** @deprecated Use WorkspaceAgentAdapter */
export type SoftwareEngineerAdapter = WorkspaceAgentAdapter;

export type WorkspaceAgentStartRunRequest = Omit<
  StartRunRequest<WorkspaceInput>,
  "agentDefinitionId" | "definitionId" | "inputs" | "capabilityGrant"
> & {
  attachments?: readonly AttachmentInput[];
  agentDefinitionId?: string;
};

/** @deprecated Use WorkspaceAgentStartRunRequest */
export type SoftwareEngineerStartRunRequest = WorkspaceAgentStartRunRequest;

export type WorkspaceAgentExecutor = Omit<
  RunExecutor<WorkspaceInput>,
  "startRun"
> & {
  startRun(request: WorkspaceAgentStartRunRequest): string;
};

/** @deprecated Use WorkspaceAgentExecutor */
export type SoftwareEngineerExecutor = WorkspaceAgentExecutor;

type RosterPerson = {
  role: AgentRole;
  kind: AgentRuntimeKind;
  image: string;
  /** Include GitHub repository checkout inputs when starting this person. */
  includeRepository: boolean;
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
 * Workspace roster: software-engineer (cursor + repo) and antboy (openai-agents, no repo).
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

  const people: RosterPerson[] = [
    {
      role: softwareEngineerRole,
      kind: "cursor",
      image: cursorImage,
      includeRepository: true,
    },
    {
      role: antboyRole,
      kind: "openai-agents",
      image: openaiImage,
      includeRepository: false,
    },
  ];

  const byId = new Map(people.map((person) => [person.role.id, person]));
  const allRequested = new Map<string, Map<string, readonly string[]>>();
  for (const person of people) {
    allRequested.set(person.role.id, personCapabilities(person.role));
  }

  // Validate adapters against the union of requested capabilities (SE requests GitHub).
  const unionRequested = personCapabilities(softwareEngineerRole);
  for (const capability of antboyRole.requestedCapabilities) {
    if (!unionRequested.has(capability.id)) {
      unionRequested.set(capability.id, capability.tools);
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

  const capabilities = capabilityAdapters.length
    ? createCapabilitySessionFactory({
        createGateway: (context) =>
          createMcpGateway({
            upstreams: capabilityAdapters
              .filter((adapter) =>
                adapter.applies ? adapter.applies(context) : true,
              )
              .map((adapter) => adapter.createUpstream(context)),
          }),
        createEndpoint: options.createCapabilityEndpoint!,
      })
    : undefined;

  const executor = createRunExecutor<WorkspaceInput>({
    definitions: {
      resolve(id) {
        const person = byId.get(id);
        if (!person) return undefined;
        if (person.kind === "cursor") {
          if (!options.cursor) return undefined;
          return {
            id: person.role.id,
            instructions: person.role.instructions,
            requestedCapabilities: person.role.requestedCapabilities,
            runtime: {
              kind: "cursor",
              image: person.image,
              cursor: options.cursor(),
            },
            executionPolicy: defaultLimits,
          } satisfies AgentDefinition;
        }
        if (!options.model) return undefined;
        return {
          id: person.role.id,
          instructions: person.role.instructions,
          requestedCapabilities: person.role.requestedCapabilities,
          runtime: {
            kind: "openai-agents",
            image: person.image,
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
        throw new Error("Cursor agent runtime is not configured");
      }
      if (person.kind === "openai-agents" && !options.model) {
        throw new Error("LLM provider is not configured");
      }

      const requested = allRequested.get(agentDefinitionId)!;
      const eligible = capabilityAdapters.filter((adapter) => {
        if (!requested.has(adapter.id)) return false;
        return adapter.applies
          ? adapter.applies({ grantContext: runRequest.grantContext })
          : true;
      });
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

/** @deprecated Use createWorkspaceAgentsExecutor */
export const createSoftwareEngineerExecutor = createWorkspaceAgentsExecutor;
