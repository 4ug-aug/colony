import type { AgentGrantContext } from "./grant-context";

export interface ModelRuntimeConfig {
  provider?: "openai" | "custom";
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Cursor agent-runtime credentials. Distinct from OpenAI-compatible ModelRuntimeConfig. */
export interface CursorRuntimeConfig {
  apiKey: string;
  model: string;
}

/** Agent-loop runtimes a workspace person can declare. */
export type AgentRuntimeKind = "cursor" | "openai-agents";

export type AgentRuntimeConfig =
  | {
      kind: "cursor";
      /** Explicit container image for this person; never derived from kind alone. */
      image: string;
      cursor: CursorRuntimeConfig;
    }
  | {
      kind: "openai-agents";
      /** Explicit container image for this person; never derived from kind alone. */
      image: string;
      model: ModelRuntimeConfig;
    }
  | {
      /**
       * A fixed command supplied by the provider rather than a model-driven
       * agent loop. Carries no credentials because it never calls a model.
       */
      kind: "command";
      image: string;
    };

export interface AgentDefinition {
  id: string;
  instructions: string;
  requestedCapabilities: readonly {
    id: string;
    tools: readonly string[];
  }[];
  runtime: AgentRuntimeConfig;
  executionPolicy: {
    maxDurationMs: number;
    maxOutputBytes: number;
    maxSteps: number;
  };
}

export interface AgentDefinitionResolver {
  resolve(
    id: string,
    grantContext?: AgentGrantContext,
  ): AgentDefinition | undefined;
}

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
    return definition ? structuredClone(definition) : undefined;
  }
}

export function createInMemoryAgentDefinitionResolver(
  definitions: Iterable<AgentDefinition> | ReadonlyMap<string, AgentDefinition>,
): AgentDefinitionResolver {
  return new InMemoryAgentDefinitionResolver(definitions);
}
