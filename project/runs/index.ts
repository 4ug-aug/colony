import type { AgentDefinition, AgentDefinitionResolver } from "../agents/definition";
import type { AgentGrantContext } from "../agents/grant-context";
import type { McpGrant } from "../mcp/gateway";
import type { CapabilitySessionBinding, CapabilitySessionFactory } from "../mcp/session";
import type { Step } from "../runtime/step";
import type {
    ExecRequest,
    ExecutionResult,
    Sandbox,
    SandboxProvider,
    SandboxSpec,
} from "../sandboxes";

const snapshot = <T>(value: T): T => structuredClone(value);

export type { Step, StepKind } from "../runtime/step";

export type RunState =
  | "preparing"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface RunLimits {
  maxDurationMs: number;
  maxOutputBytes: number;
  maxSteps: number;
}

export interface RunInput {
  type: string;
}

export interface RunRecord<Input extends RunInput = RunInput> {
  id: string;
  state: RunState;
  task: string;
  definition: AgentDefinition;
  inputs: readonly Input[];
  capabilityGrant?: McpGrant;
  grantContext?: AgentGrantContext;
  effectiveLimits: RunLimits;
  stdout: string;
  stderr: string;
  exitCode?: number;
  /** Warm multi-turn: true while await runTurn is in flight. */
  turnActive?: boolean;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface RunStore<Input extends RunInput = RunInput> {
  create(record: RunRecord<Input>): void;
  get(id: string): RunRecord<Input> | undefined;
  list(): RunRecord<Input>[];
  update(id: string, patch: Partial<RunRecord<Input>>): void;
  subscribe(listener: (record: RunRecord<Input>) => void): () => void;
}

export class InMemoryRunStore<Input extends RunInput = RunInput> implements RunStore<Input> {
  private readonly records = new Map<string, RunRecord<Input>>();
  private readonly listeners = new Set<(record: RunRecord<Input>) => void>();

  private publish(record: RunRecord<Input>): void {
    const value = snapshot(record);
    for (const listener of this.listeners) listener(value);
  }

  create(record: RunRecord<Input>): void {
    if (this.records.has(record.id)) throw new Error(`Run already exists: ${record.id}`);
    const value = snapshot(record);
    this.records.set(record.id, value);
    this.publish(value);
  }

  get(id: string): RunRecord<Input> | undefined {
    const record = this.records.get(id);
    return record ? snapshot(record) : undefined;
  }

  list(): RunRecord<Input>[] {
    return [...this.records.values()].map(snapshot);
  }

  update(id: string, patch: Partial<RunRecord<Input>>): void {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown run: ${id}`);
    const value = snapshot({ ...record, ...patch });
    this.records.set(id, value);
    this.publish(value);
  }

  subscribe(listener: (record: RunRecord<Input>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function createInMemoryRunStore<Input extends RunInput = RunInput>(): RunStore<Input> {
  return new InMemoryRunStore<Input>();
}

export interface RuntimeRequest {
  definition: AgentDefinition;
  task: string;
  workspace?: string;
  capabilitySession?: CapabilitySessionBinding;
  onOutput?: ExecRequest["onOutput"];
  onStep?: (step: Step) => void;
}

/** Multi-turn provider session kept alive across Grill follow-up submits. */
export interface WarmRuntimeSession {
  runTurn(task: string): Promise<ExecutionResult>;
  dispose(): Promise<void>;
}

export interface AgentProvider {
  run(sandbox: Sandbox, request: RuntimeRequest): Promise<ExecutionResult>;
  openWarmSession?(
    sandbox: Sandbox,
    request: Omit<RuntimeRequest, "task">,
  ): Promise<WarmRuntimeSession>;
}

/** Default idle recycle for Grill-linked warm runs (15 minutes). */
export const DEFAULT_WARM_IDLE_TTL_MS = 15 * 60_000;

export interface StartRunRequest<Input extends RunInput = never> {
  agentDefinitionId?: string;
  definitionId?: string;
  task: string;
  inputs?: readonly Input[];
  capabilityGrant?: McpGrant;
  grantContext?: AgentGrantContext;
  maxDurationMs?: number;
  timeoutMs?: number;
  maxOutputBytes?: number;
  maxSteps?: number;
  /** Keep provider agent + sandbox warm for followUp turns. */
  warm?: boolean;
  idleTtlMs?: number;
  onCreate?: (record: RunRecord<Input>) => void;
}

export interface RunExecutor<Input extends RunInput = never> {
  startRun(request: StartRunRequest<Input>): string;
  followUp(id: string, task: string): Promise<RunRecord<Input> | undefined>;
  getRun(id: string): RunRecord<Input> | undefined;
  listRuns(): RunRecord<Input>[];
  subscribe(listener: (record: RunRecord<Input>) => void): () => void;
  subscribeSteps(listener: (runId: string, step: Step) => void): () => void;
  cancelRun(id: string): Promise<RunRecord<Input> | undefined>;
  stop(): Promise<void>;
}

export interface PreparedInputs {
  workspace?: PreparedWorkspace;
}

export interface PreparedWorkspace {
  path: string;
  dispose(): Promise<void>;
  git?: {
    repository: string;
    baseRevision: string;
    baseCommit: string;
    branch: string;
  };
}

export interface InputProvisioner<Input extends RunInput> {
  prepare(
    inputs: readonly Input[],
    context: { runId: string; agentDefinitionId?: string },
  ): Promise<PreparedInputs>;
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

const MAX_STEP_TEXT_BYTES = 16 * 1024;

export function createRunExecutor<Input extends RunInput = never>(dependencies: {
  definitions: AgentDefinitionResolver;
  sandboxes: SandboxProvider;
  runtime: AgentProvider;
  store?: RunStore<Input>;
  inputs?: InputProvisioner<Input>;
  capabilities?: CapabilitySessionFactory;
  createId?: () => string;
  now?: () => number;
}): RunExecutor<Input> {
  const store: RunStore<Input> = dependencies.store ?? new InMemoryRunStore<Input>();
  const createId = dependencies.createId ?? (() => crypto.randomUUID());
  const now = dependencies.now ?? Date.now;
  const cancellation = new Set<string>();
  const active = new Map<string, Promise<void>>();
  const sandboxes = new Map<string, Sandbox>();
  const disposed = new Map<string, Promise<void>>();
  const stepListeners = new Set<(runId: string, step: Step) => void>();
  type WarmEntry = {
    session: WarmRuntimeSession;
    sandbox: Sandbox;
    workspace?: PreparedInputs["workspace"];
    capabilitySession?: CapabilitySessionBinding;
    idleTtlMs: number;
    idleTimer?: ReturnType<typeof setTimeout>;
    turnGate: Promise<void>;
  };
  const warm = new Map<string, WarmEntry>();
  let stopping: Promise<void> | undefined;

  const publishStep = (runId: string, step: Step): void => {
    for (const listener of stepListeners) listener(runId, step);
  };

  const disposeSandbox = (id: string, sandbox: Sandbox): Promise<void> => {
    const existing = disposed.get(id);
    if (existing) return existing;
    const operation = Promise.resolve().then(() => sandbox.dispose());
    disposed.set(id, operation);
    return operation;
  };

  const finish = (id: string, patch: Partial<RunRecord<Input>>): void => {
    const record = store.get(id);
    if (record && !terminal(record.state)) store.update(id, patch);
  };

  const clearIdle = (entry: WarmEntry): void => {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = undefined;
  };

  const disposeWarm = async (
    id: string,
    reason: "idle" | "cancel",
  ): Promise<void> => {
    const entry = warm.get(id);
    if (!entry) return;
    warm.delete(id);
    clearIdle(entry);
    await entry.turnGate.catch(() => undefined);
    try {
      await entry.session.dispose();
    } catch {
      // best-effort
    }
    sandboxes.delete(id);
    try {
      await disposeSandbox(id, entry.sandbox);
    } catch {
      // best-effort
    }
    if (entry.workspace) {
      try {
        await entry.workspace.dispose();
      } catch {
        // best-effort
      }
    }
    if (entry.capabilitySession) {
      try {
        await entry.capabilitySession.revoke();
      } catch {
        // best-effort
      }
    }
    finish(id, {
      state: reason === "idle" ? "succeeded" : "cancelled",
      completedAt: now(),
      turnActive: false,
    });
  };

  const armIdle = (id: string, entry: WarmEntry): void => {
    clearIdle(entry);
    entry.idleTimer = setTimeout(() => {
      void disposeWarm(id, "idle");
    }, entry.idleTtlMs);
  };

  const bindTurnHandlers = (
    record: RunRecord<Input>,
    request: Omit<RuntimeRequest, "task">,
  ): Omit<RuntimeRequest, "task"> => {
    let stepCount = 0;
    let stepsTruncated = false;
    return {
      ...request,
      onOutput: (chunk) => {
        const current = store.get(record.id);
        if (!current || terminal(current.state)) return;
        store.update(record.id, {
          [chunk.stream]: retainOutput(
            current[chunk.stream] + chunk.text,
            record.effectiveLimits.maxOutputBytes,
          ),
        });
      },
      onStep: (step) => {
        if (stepsTruncated) return;
        if (stepCount >= record.effectiveLimits.maxSteps) {
          stepsTruncated = true;
          publishStep(record.id, {
            kind: "message",
            text: "[steps truncated: reached maxSteps limit]",
            at: now(),
          });
          return;
        }
        const cap = Math.min(
          record.effectiveLimits.maxOutputBytes,
          MAX_STEP_TEXT_BYTES,
        );
        stepCount++;
        publishStep(record.id, { ...step, text: tail(step.text, cap) });
      },
    };
  };

  const executeWarm = async (
    record: RunRecord<Input>,
    idleTtlMs: number,
  ): Promise<void> => {
    let workspace: PreparedInputs["workspace"];
    let capabilitySession: CapabilitySessionBinding | undefined;
    let sandbox: Sandbox | undefined;
    try {
      if (!dependencies.runtime.openWarmSession) {
        throw new Error("Runtime does not support warm Grill-linked runs");
      }
      workspace = (
        await dependencies.inputs?.prepare(record.inputs, {
          runId: record.id,
          agentDefinitionId: record.definition.id,
        })
      )?.workspace;
      if (cancellation.has(record.id)) return;
      const spec: SandboxSpec = {
        image: record.definition.runtime.image,
        ...(workspace ? { volumes: [`${workspace.path}:/work`] } : {}),
      };
      sandbox = await dependencies.sandboxes.create(spec);
      sandboxes.set(record.id, sandbox);
      if (cancellation.has(record.id)) return;
      capabilitySession = record.capabilityGrant
        ? await dependencies.capabilities?.create(record.capabilityGrant, {
            workspace,
            sandbox,
            grantContext: record.grantContext,
          })
        : undefined;
      if (cancellation.has(record.id)) return;

      store.update(record.id, {
        state: "running",
        startedAt: now(),
        turnActive: true,
      });
      const baseRequest = bindTurnHandlers(record, {
        definition: snapshot(record.definition),
        ...(workspace ? { workspace: "/work" } : {}),
        ...(capabilitySession ? { capabilitySession } : {}),
      });
      const session = await dependencies.runtime.openWarmSession(
        sandbox,
        baseRequest,
      );
      try {
        const result = await session.runTurn(record.task);
        store.update(record.id, {
          stdout: tail(result.stdout, record.effectiveLimits.maxOutputBytes),
          stderr: tail(result.stderr, record.effectiveLimits.maxOutputBytes),
          exitCode: result.exitCode,
          turnActive: false,
        });
        if (result.exitCode !== 0) {
          await session.dispose();
          throw new Error(`Runtime exited with code ${result.exitCode}`);
        }
        if (cancellation.has(record.id)) {
          await session.dispose();
          return;
        }
        const entry: WarmEntry = {
          session,
          sandbox,
          workspace,
          capabilitySession,
          idleTtlMs,
          turnGate: Promise.resolve(),
        };
        warm.set(record.id, entry);
        armIdle(record.id, entry);
        // Keep resources; disposeWarm handles cleanup on idle/cancel.
        sandbox = undefined;
        workspace = undefined;
        capabilitySession = undefined;
      } finally {
        const current = store.get(record.id);
        if (current?.turnActive) store.update(record.id, { turnActive: false });
      }
    } catch (error) {
      finish(record.id, {
        state: "failed",
        completedAt: now(),
        turnActive: false,
        error: errorText(error),
      });
    } finally {
      if (sandbox) {
        sandboxes.delete(record.id);
        try {
          await disposeSandbox(record.id, sandbox);
        } catch {
          // best-effort
        }
      }
      if (workspace) {
        try {
          await workspace.dispose();
        } catch {
          // best-effort
        }
      }
      if (capabilitySession) {
        try {
          await capabilitySession.revoke();
        } catch {
          // best-effort
        }
      }
    }
  };

  const execute = async (record: RunRecord<Input>): Promise<void> => {
    let workspace: PreparedInputs["workspace"];
    let capabilitySession: CapabilitySessionBinding | undefined;
    let sandbox: Sandbox | undefined;
    let result: ExecutionResult | undefined;
    let failure: string | undefined;
    let cleanupFailure: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      workspace = (
        await dependencies.inputs?.prepare(record.inputs, {
          runId: record.id,
          agentDefinitionId: record.definition.id,
        })
      )?.workspace;
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
      capabilitySession = record.capabilityGrant
        ? await dependencies.capabilities?.create(record.capabilityGrant, { workspace, sandbox, grantContext: record.grantContext })
        : undefined;
      if (cancellation.has(record.id)) return;

      store.update(record.id, { state: "running", startedAt: now() });
      let stepCount = 0;
      let stepsTruncated = false;
      const runtime = dependencies.runtime.run(sandbox, {
        definition: snapshot(record.definition),
        task: record.task,
        ...(workspace ? { workspace: "/work" } : {}),
        ...(capabilitySession ? { capabilitySession } : {}),
        onOutput: (chunk) => {
          const current = store.get(record.id);
          if (!current || terminal(current.state)) return;
          store.update(record.id, {
            [chunk.stream]: retainOutput(
              current[chunk.stream] + chunk.text,
              record.effectiveLimits.maxOutputBytes,
            ),
          });
        },
        onStep: (step) => {
          if (stepsTruncated) return;
          if (stepCount >= record.effectiveLimits.maxSteps) {
            stepsTruncated = true;
            const marker: Step = { kind: "message", text: "[steps truncated: reached maxSteps limit]", at: now() };
            publishStep(record.id, marker);
            return;
          }
          const cap = Math.min(record.effectiveLimits.maxOutputBytes, MAX_STEP_TEXT_BYTES);
          const bounded: Step = { ...step, text: tail(step.text, cap) };
          stepCount++;
          publishStep(record.id, bounded);
        },
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
          await capabilitySession.revoke();
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

  const cancelRun = async (id: string): Promise<RunRecord<Input> | undefined> => {
    const record = store.get(id);
    if (!record || terminal(record.state)) return record;
    cancellation.add(id);
    if (warm.has(id)) {
      await disposeWarm(id, "cancel");
      return store.get(id);
    }
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
  };

  const followUp = async (
    id: string,
    task: string,
  ): Promise<RunRecord<Input> | undefined> => {
    const entry = warm.get(id);
    const record = store.get(id);
    if (!entry || !record || terminal(record.state)) return record;
    clearIdle(entry);
    store.update(id, { turnActive: true });
    const turn = (async () => {
      try {
        const result = await entry.session.runTurn(task);
        const current = store.get(id);
        if (!current || terminal(current.state)) return;
        store.update(id, {
          task,
          stdout: tail(
            current.stdout + result.stdout,
            current.effectiveLimits.maxOutputBytes,
          ),
          stderr: tail(
            current.stderr + result.stderr,
            current.effectiveLimits.maxOutputBytes,
          ),
          exitCode: result.exitCode,
          turnActive: false,
        });
        if (result.exitCode !== 0) {
          warm.delete(id);
          clearIdle(entry);
          try {
            await entry.session.dispose();
          } catch {
            // best-effort
          }
          sandboxes.delete(id);
          try {
            await disposeSandbox(id, entry.sandbox);
          } catch {
            // best-effort
          }
          if (entry.workspace) {
            try {
              await entry.workspace.dispose();
            } catch {
              // best-effort
            }
          }
          if (entry.capabilitySession) {
            try {
              await entry.capabilitySession.revoke();
            } catch {
              // best-effort
            }
          }
          finish(id, {
            state: "failed",
            completedAt: now(),
            turnActive: false,
            error: `Runtime exited with code ${result.exitCode}`,
          });
        }
      } finally {
        const current = store.get(id);
        if (current?.turnActive) store.update(id, { turnActive: false });
      }
    })();
    entry.turnGate = turn.then(
      () => undefined,
      () => undefined,
    );
    await turn;
    if (warm.has(id)) armIdle(id, entry);
    return store.get(id);
  };

  return {
    startRun(request) {
      if (stopping) throw new Error("Run executor is stopping");
      const definitionId = request.agentDefinitionId ?? request.definitionId;
      if (!definitionId) throw new Error("Agent definition ID is required");
      const definition = dependencies.definitions.resolve(
        definitionId,
        request.grantContext,
      );
      if (!definition) throw new Error(`Unknown agent definition: ${definitionId}`);
      if (request.capabilityGrant && !dependencies.capabilities) {
        throw new Error("A capability session factory is required for a capability grant");
      }
      if (request.warm && !dependencies.runtime.openWarmSession) {
        throw new Error("Runtime does not support warm Grill-linked runs");
      }
      if (request.capabilityGrant) {
        const requestedTools = new Set(
          definition.requestedCapabilities.flatMap((capability) => capability.tools),
        );
        const unexpected = request.capabilityGrant.tools.filter((tool) => !requestedTools.has(tool));
        if (unexpected.length) {
          throw new Error(`Capability grant exceeds agent definition: ${unexpected.join(", ")}`);
        }
      }
      const maxDurationMs = request.maxDurationMs ?? request.timeoutMs ?? definition.executionPolicy.maxDurationMs;
      const maxOutputBytes = request.maxOutputBytes ?? definition.executionPolicy.maxOutputBytes;
      const maxSteps = request.maxSteps ?? definition.executionPolicy.maxSteps;
      if (!Number.isSafeInteger(maxDurationMs) || maxDurationMs <= 0 || maxDurationMs > definition.executionPolicy.maxDurationMs) {
        throw new Error("Requested maxDurationMs must be positive and within the agent definition limit");
      }
      if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0 || maxOutputBytes > definition.executionPolicy.maxOutputBytes) {
        throw new Error("Requested maxOutputBytes must be positive and within the agent definition limit");
      }
      if (!Number.isSafeInteger(maxSteps) || maxSteps <= 0 || maxSteps > definition.executionPolicy.maxSteps) {
        throw new Error("Requested maxSteps must be positive and within the agent definition limit");
      }

      const record: RunRecord<Input> = {
        id: createId(),
        state: "preparing",
        task: request.task,
        definition: snapshot(definition),
        inputs: snapshot(request.inputs ?? []),
        ...(request.capabilityGrant
          ? {
              capabilityGrant: {
                ...snapshot(request.capabilityGrant),
                expiresAt: new Date(Math.min(
                  request.capabilityGrant.expiresAt.getTime(),
                  now() + maxDurationMs,
                )),
              },
            }
          : {}),
        ...(request.grantContext !== undefined ? { grantContext: snapshot(request.grantContext) } : {}),
        effectiveLimits: { maxDurationMs, maxOutputBytes, maxSteps },
        stdout: "",
        stderr: "",
        createdAt: now(),
      };
      request.onCreate?.(snapshot(record));
      store.create(record);
      const idleTtlMs = request.idleTtlMs ?? DEFAULT_WARM_IDLE_TTL_MS;
      const operation = request.warm
        ? executeWarm(record, idleTtlMs)
        : execute(record);
      active.set(record.id, operation);
      void operation.then(
        () => {
          if (!warm.has(record.id)) active.delete(record.id);
        },
        () => active.delete(record.id),
      );
      return record.id;
    },

    followUp,

    getRun(id) {
      return store.get(id);
    },

    listRuns() {
      return store.list();
    },

    subscribe(listener) {
      return store.subscribe(listener);
    },

    subscribeSteps(listener) {
      stepListeners.add(listener);
      return () => stepListeners.delete(listener);
    },

    cancelRun,

    stop() {
      return stopping ??= (async () => {
        await Promise.all([
          ...active.keys(),
          ...warm.keys(),
        ].map((id) => cancelRun(id)));
      })();
    },
  };
}
