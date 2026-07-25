import type {
  ExecutionResult,
  Sandbox,
  SandboxProvider,
  SandboxSpec,
} from "../sandboxes";
import type { CapabilitySessionBinding, CapabilitySessionFactory } from "../mcp/session";
import type { McpGrant } from "../mcp/gateway";

export interface ModelRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AgentDefinition {
  id: string;
  instructions: string;
  requestedCapabilities: readonly {
    id: string;
    tools: readonly string[];
  }[];
  runtime: {
    image: string;
    model?: ModelRuntimeConfig;
  };
  executionPolicy: {
    maxDurationMs: number;
    maxOutputBytes: number;
  };
}

export interface AgentDefinitionResolver {
  resolve(id: string): AgentDefinition | undefined;
}

const snapshot = <T>(value: T): T => structuredClone(value);

export class InMemoryAgentDefinitionResolver
  implements AgentDefinitionResolver
{
  private readonly definitions: Map<string, AgentDefinition>;

  constructor(definitions: Iterable<AgentDefinition> | ReadonlyMap<string, AgentDefinition>) {
    if (definitions instanceof Map) {
      this.definitions = new Map(definitions);
    } else if (typeof (definitions as ReadonlyMap<string, AgentDefinition>).get === "function") {
      this.definitions = new Map(
        (definitions as ReadonlyMap<string, AgentDefinition>).entries(),
      );
    } else {
      this.definitions = new Map(
        [...(definitions as Iterable<AgentDefinition>)].map((definition) => [definition.id, definition]),
      );
    }
  }

  resolve(id: string): AgentDefinition | undefined {
    const definition = this.definitions.get(id);
    return definition ? snapshot(definition) : undefined;
  }
}

export function createInMemoryAgentDefinitionResolver(
  definitions: Iterable<AgentDefinition> | ReadonlyMap<string, AgentDefinition>,
): AgentDefinitionResolver {
  return new InMemoryAgentDefinitionResolver(definitions);
}

export type RunState =
  | "preparing"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface RunLimits {
  maxDurationMs: number;
  maxOutputBytes: number;
}

export interface RunRecord {
  id: string;
  state: RunState;
  task: string;
  definition: AgentDefinition;
  inputs: readonly RunInput[];
  capabilityGrant?: McpGrant;
  effectiveLimits: RunLimits;
  stdout: string;
  stderr: string;
  exitCode?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface RunStore {
  create(record: RunRecord): void;
  get(id: string): RunRecord | undefined;
  update(id: string, patch: Partial<RunRecord>): void;
}

export class InMemoryRunStore implements RunStore {
  private readonly records = new Map<string, RunRecord>();

  create(record: RunRecord): void {
    if (this.records.has(record.id)) throw new Error(`Run already exists: ${record.id}`);
    this.records.set(record.id, snapshot(record));
  }

  get(id: string): RunRecord | undefined {
    const record = this.records.get(id);
    return record ? snapshot(record) : undefined;
  }

  update(id: string, patch: Partial<RunRecord>): void {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown run: ${id}`);
    this.records.set(id, snapshot({ ...record, ...patch }));
  }
}

export function createInMemoryRunStore(): RunStore {
  return new InMemoryRunStore();
}

export interface RuntimeRequest {
  definition: AgentDefinition;
  task: string;
  workspace?: string;
  capabilitySession?: CapabilitySessionBinding;
}

export interface AgentProvider {
  run(sandbox: Sandbox, request: RuntimeRequest): Promise<ExecutionResult>;
}

export interface StartRunRequest {
  agentDefinitionId?: string;
  definitionId?: string;
  task: string;
  inputs?: readonly RunInput[];
  capabilityGrant?: McpGrant;
  maxDurationMs?: number;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface RunExecutor {
  startRun(request: StartRunRequest): string;
  getRun(id: string): RunRecord | undefined;
  cancelRun(id: string): Promise<RunRecord | undefined>;
}

export type RunInput = RepositoryInput;

export interface RepositoryInput {
  type: "repository";
  provider: string;
  repository: string;
  revision: string;
}

export interface PreparedInputs {
  workspace?: { path: string; dispose(): Promise<void> };
}

export interface InputProvisioner {
  prepare(inputs: readonly RunInput[]): Promise<PreparedInputs>;
}

const terminal = (state: RunState): boolean =>
  state === "succeeded" || state === "failed" || state === "cancelled";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tail(value: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maxBytes) return value;
  const marker = new TextEncoder().encode("[truncated]\n");
  if (maxBytes <= marker.byteLength) {
    return new TextDecoder().decode(marker.slice(0, maxBytes));
  }
  let start = bytes.byteLength - maxBytes + marker.byteLength;
  while (start < bytes.byteLength && (bytes[start] & 0xc0) === 0x80) start++;
  return `[truncated]\n${new TextDecoder().decode(bytes.slice(start))}`;
}

export function retainOutput(value: string, maxBytes: number): string {
  return tail(value, maxBytes);
}

export function createRunExecutor(dependencies: {
  definitions: AgentDefinitionResolver;
  sandboxes: SandboxProvider;
  runtime: AgentProvider;
  store?: RunStore;
  inputs?: InputProvisioner;
  capabilities?: CapabilitySessionFactory;
  createId?: () => string;
  now?: () => number;
}): RunExecutor {
  const store = dependencies.store ?? new InMemoryRunStore();
  const createId = dependencies.createId ?? (() => crypto.randomUUID());
  const now = dependencies.now ?? Date.now;
  const cancellation = new Set<string>();
  const active = new Map<string, Promise<void>>();
  const sandboxes = new Map<string, Sandbox>();
  const disposed = new Map<string, Promise<void>>();

  const disposeSandbox = (id: string, sandbox: Sandbox): Promise<void> => {
    const existing = disposed.get(id);
    if (existing) return existing;
    const operation = Promise.resolve().then(() => sandbox.dispose());
    disposed.set(id, operation);
    return operation;
  };

  const finish = (id: string, patch: Partial<RunRecord>): void => {
    const record = store.get(id);
    if (record && !terminal(record.state)) store.update(id, patch);
  };

  const execute = async (record: RunRecord): Promise<void> => {
    let workspace: PreparedInputs["workspace"];
    let capabilitySession: CapabilitySessionBinding | undefined;
    let sandbox: Sandbox | undefined;
    let result: ExecutionResult | undefined;
    let failure: string | undefined;
    let cleanupFailure: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      workspace = (await dependencies.inputs?.prepare(record.inputs))?.workspace;
      if (cancellation.has(record.id)) return;
      capabilitySession = record.capabilityGrant
        ? dependencies.capabilities?.create(record.capabilityGrant)
        : undefined;
      if (cancellation.has(record.id)) return;

      const spec: SandboxSpec = {
        image: record.definition.runtime.image,
        ...(workspace
          ? { volumes: [`${workspace.path}:/work`] }
          : {}),
      };
      sandbox = await dependencies.sandboxes.create(spec);
      sandboxes.set(record.id, sandbox);
      if (cancellation.has(record.id)) return;

      store.update(record.id, { state: "running", startedAt: now() });
      const runtime = dependencies.runtime.run(sandbox, {
        definition: snapshot(record.definition),
        task: record.task,
        ...(workspace ? { workspace: "/work" } : {}),
        ...(capabilitySession ? { capabilitySession } : {}),
      });
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          cancellation.add(record.id);
          void disposeSandbox(record.id, sandbox!).catch(() => undefined);
          reject(new Error("Run timed out"));
        }, record.effectiveLimits.maxDurationMs);
      });
      try {
        result = await Promise.race([runtime, timeout]);
      } catch (error) {
        failure = errorText(error);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (error) {
      failure = errorText(error);
    } finally {
      sandboxes.delete(record.id);
      if (sandbox) {
        try {
          await disposeSandbox(record.id, sandbox);
        } catch (error) {
          cleanupFailure = errorText(error);
        }
      }
      if (workspace) {
        try {
          await workspace.dispose();
        } catch (error) {
          cleanupFailure = errorText(error);
        }
      }
      if (capabilitySession) {
        try {
          capabilitySession.revoke();
        } catch (error) {
          cleanupFailure = errorText(error);
        }
      }
    }

    const cancelled = cancellation.has(record.id);
    if (cleanupFailure) {
      finish(record.id, {
        state: "failed",
        completedAt: now(),
        error: cleanupFailure,
      });
      return;
    }
    if (cancelled) {
      finish(record.id, { state: "cancelled", completedAt: now() });
      return;
    }
    if (result) {
      finish(record.id, {
        state: result.exitCode === 0 ? "succeeded" : "failed",
        stdout: tail(result.stdout, record.effectiveLimits.maxOutputBytes),
        stderr: tail(result.stderr, record.effectiveLimits.maxOutputBytes),
        exitCode: result.exitCode,
        completedAt: now(),
        ...(result.exitCode === 0
          ? {}
          : { error: `Runtime exited with code ${result.exitCode}` }),
      });
      return;
    }
    finish(record.id, { state: "failed", completedAt: now(), error: failure ?? "Run failed" });
  };

  return {
    startRun(request) {
      const definitionId = request.agentDefinitionId ?? request.definitionId;
      if (!definitionId) throw new Error("Agent definition ID is required");
      const definition = dependencies.definitions.resolve(definitionId);
      if (!definition) throw new Error(`Unknown agent definition: ${definitionId}`);
      if (request.capabilityGrant && !dependencies.capabilities) {
        throw new Error("A capability session factory is required for a capability grant");
      }
      const maxDurationMs = request.maxDurationMs ?? request.timeoutMs ?? definition.executionPolicy.maxDurationMs;
      const maxOutputBytes = request.maxOutputBytes ?? definition.executionPolicy.maxOutputBytes;
      if (!Number.isSafeInteger(maxDurationMs) || maxDurationMs <= 0 || maxDurationMs > definition.executionPolicy.maxDurationMs) {
        throw new Error("Requested maxDurationMs must be positive and within the agent definition limit");
      }
      if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0 || maxOutputBytes > definition.executionPolicy.maxOutputBytes) {
        throw new Error("Requested maxOutputBytes must be positive and within the agent definition limit");
      }

      const record: RunRecord = {
        id: createId(),
        state: "preparing",
        task: request.task,
        definition: snapshot(definition),
        inputs: snapshot(request.inputs ?? []),
        ...(request.capabilityGrant
          ? { capabilityGrant: snapshot(request.capabilityGrant) }
          : {}),
        effectiveLimits: { maxDurationMs, maxOutputBytes },
        stdout: "",
        stderr: "",
        createdAt: now(),
      };
      store.create(record);
      const operation = execute(record);
      active.set(record.id, operation);
      void operation.then(
        () => active.delete(record.id),
        () => active.delete(record.id),
      );
      return record.id;
    },

    getRun(id) {
      return store.get(id);
    },

    async cancelRun(id) {
      const record = store.get(id);
      if (!record || terminal(record.state)) return record;
      cancellation.add(id);
      const sandbox = sandboxes.get(id);
      if (sandbox) {
        try {
          await disposeSandbox(id, sandbox);
        } catch {
          // execute() records cleanup failure and makes the run failed.
        }
      }
      await active.get(id);
      return store.get(id);
    },
  };
}
