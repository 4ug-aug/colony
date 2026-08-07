import type { WorkspaceAgentAdapter } from "./roster";
import type { Octokit } from "octokit";
import { createGitHubRepositoryCheckoutSource } from "../inputs/github";
import { createAsanaMcpUpstream } from "../mcp/asana";
import { createGitHubMcpUpstream } from "../mcp/github";
import { createLinearMcpUpstream } from "../mcp/linear";
import {
  createGrafanaMcpUpstream,
  type GrafanaConfiguration,
} from "../mcp/grafana";
import {
  createOutlineMcpUpstream,
  type OutlineConfiguration,
} from "../mcp/outline";
import {
  createWorkspaceMcpUpstream,
  type WorkspaceRoomPort,
} from "../mcp/workspace";
import {
  createWorkspaceIssuesMcpUpstream,
  type AssignableOwner,
  type WorkspaceIssuesPort,
} from "../mcp/workspace-issues";
import { STEP_TEXT_LIMIT } from "../runtime/step";
import { rosterParticipant } from "./roster-meta";

export function createWorkspaceSoftwareEngineerAdapter(options: {
  port: WorkspaceRoomPort;
}): WorkspaceAgentAdapter {
  return {
    capability: {
      id: "workspace.room",
      applies({ grantContext }) {
        return Boolean(grantContext?.roomId);
      },
      createUpstream({ grantContext }) {
        const roomId = grantContext?.roomId;
        if (!roomId) {
          throw new Error("A room id is required for the workspace capability");
        }
        return createWorkspaceMcpUpstream({
          port: options.port,
          roomId,
          agent: rosterParticipant(
            grantContext?.agentDefinitionId ?? "software-engineer",
          ),
        });
      },
    },
  };
}

export function createWorkspaceIssuesAdapter(options: {
  port: WorkspaceIssuesPort;
  listAssignableOwners?: () => AssignableOwner[];
}): WorkspaceAgentAdapter {
  return {
    capability: {
      id: "workspace.issues",
      createUpstream: () =>
        createWorkspaceIssuesMcpUpstream({
          port: options.port,
          ...(options.listAssignableOwners
            ? { listAssignableOwners: options.listAssignableOwners }
            : {}),
        }),
    },
  };
}

export function createLinearSoftwareEngineerAdapter(options: {
  accessToken: string;
}): WorkspaceAgentAdapter {
  return {
    capability: {
      id: "linear.issues",
      createUpstream: () => createLinearMcpUpstream(options),
    },
  };
}

export function createAsanaSoftwareEngineerAdapter(options: {
  apiToken: string;
  projectGid: string;
}): WorkspaceAgentAdapter {
  return {
    capability: {
      id: "asana.tasks",
      createUpstream: () => createAsanaMcpUpstream(options),
    },
  };
}

/** Outline wiki documents. Requested by antboy only. */
export function createOutlineAdapter(
  options: OutlineConfiguration,
): WorkspaceAgentAdapter {
  return {
    capability: {
      id: "outline.documents",
      createUpstream: () => createOutlineMcpUpstream(options),
    },
  };
}

/** Remote Grafana MCP. Requested by antboy only. */
export function createGrafanaAdapter(
  options: GrafanaConfiguration,
): WorkspaceAgentAdapter {
  return {
    capability: {
      id: "grafana.observability",
      createUpstream: () => createGrafanaMcpUpstream(options),
    },
  };
}

export function createGitHubSoftwareEngineerAdapter(options: {
  octokit: Octokit;
  repository: string;
  base: string;
  verifyCommand?: string;
}): WorkspaceAgentAdapter {
  return {
    repository: {
      input: {
        type: "repository",
        provider: "github",
        repository: options.repository,
        revision: options.base,
      },
      source: createGitHubRepositoryCheckoutSource({
        octokit: options.octokit,
      }),
    },
    ...(options.verifyCommand
      ? {
          capability: {
            id: "github.pull-requests",
            resources: [{ provider: "github", repository: options.repository }],
            createUpstream: ({ workspace, sandbox }) => {
              if (workspace?.git?.repository !== options.repository) {
                throw new Error(
                  "GitHub capability and prepared repository must match",
                );
              }
              if (!sandbox) {
                throw new Error(
                  "A sandbox is required to verify a pull request",
                );
              }
              return createGitHubMcpUpstream({
                octokit: options.octokit,
                repository: options.repository,
                workspace: workspace.path,
                branch: workspace.git.branch,
                baseCommit: workspace.git.baseCommit,
                base: options.base,
                verify: async () => {
                  const result = await sandbox.exec({
                    command: ["sh", "-lc", options.verifyCommand!],
                    workdir: "/work",
                  });
                  if (result.exitCode === 0) return;
                  const output = [result.stdout, result.stderr]
                    .filter(Boolean)
                    .join("\n")
                    .slice(-STEP_TEXT_LIMIT);
                  throw new Error(
                    `Verification failed with code ${result.exitCode}${
                      output ? `:\n${output}` : ""
                    }`,
                  );
                },
              });
            },
          },
        }
      : {}),
  };
}

export type { WorkspaceAgentAdapter };
