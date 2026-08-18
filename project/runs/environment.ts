/** The checkout facts a person cannot read off its own definition. */
export interface WorkspaceCheckout {
  repository: string;
  baseRevision: string;
  baseCommit: string;
  branch: string;
}

const SANDBOX = `Environment: you run as root inside a disposable sandbox created for this run alone and destroyed when it ends. Nothing you do inside it reaches the host or another run, so install packages, change local configuration, and run whatever commands the task needs. Network access is available. When a command fails for an environment reason rather than a task reason, work around it and report what you did; environment friction is not a policy boundary.`;

/**
 * What the sandbox and checkout are, for a person who cannot see them.
 * Platform-supplied rather than role-supplied: a role states intent, never run
 * mechanics. Keyed off the prepared workspace rather than a role flag, so it can
 * only describe a checkout that actually exists.
 */
export function instructionsForEnvironment(git?: WorkspaceCheckout): string {
  if (!git) return SANDBOX;
  return `${SANDBOX}\n\nWorkspace: the Git repository ${git.repository}, checked out at upstream commit ${git.baseRevision} onto local branch ${git.branch}, with no remote and no credentials configured. The pristine checkout is committed as ${git.baseCommit}; diff against it to review your own changes.`;
}
