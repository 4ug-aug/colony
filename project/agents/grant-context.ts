export type AgentGrantContext = {
  roomId?: string;
  /** Invocation root for a Room-linked run: binds workspace.post_message to this thread root. */
  rootId?: string;
  /** Set only for an in-thread invocation: binds workspace.read_messages to this thread root's transcript instead of the flat Room. */
  threadReadRootId?: string;
  scheduleId?: string;
  issueId?: string;
  grillId?: string;
  /** Private ad-hoc dispatch; not a Room / Issue / Schedule / Grill link. */
  oneshotId?: string;
  /** Checkout + PR merge base override (Issue branch or Oneshot revision). */
  repositoryBase?: string;
  /** Extra Git heads to merge onto repositoryBase during Issue integrate checkout. */
  mergeRevisions?: string[];
  agentDefinitionId?: string;
};
