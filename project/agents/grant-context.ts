export type AgentGrantContext = {
  roomId?: string;
  scheduleId?: string;
  issueId?: string;
  grillId?: string;
  /** Checkout + PR merge base override (Issue branch). */
  repositoryBase?: string;
  agentDefinitionId?: string;
};
