export interface AgentRole {
  id: string;
  instructions: string;
  requestedCapabilities: readonly {
    id: string;
    tools: readonly string[];
  }[];
}
