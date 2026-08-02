export interface ModelRuntimeConfig {
  provider?: "openai" | "custom";
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
    maxSteps: number;
  };
}

export interface AgentDefinitionResolver {
  resolve(id: string): AgentDefinition | undefined;
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
