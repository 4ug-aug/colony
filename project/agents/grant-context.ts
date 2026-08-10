export type AgentGrantContext = {
  roomId?: string;
  scheduleId?: string;
  issueId?: string;
  grillId?: string;
  /** Private ad-hoc dispatch; not a Room / Issue / Schedule / Grill link. */
  oneshotId?: string;
  /** Checkout + PR merge base override (Issue branch or Oneshot revision). */
  repositoryBase?: string;
  agentDefinitionId?: string;
};
