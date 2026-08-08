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
import {
  createWorkspaceGrillMcpUpstream,
  type GrillFrontier,
  type GrillIssueProposal,
  type GrillProposedIssue,
} from "../mcp/workspace-grill";
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

export function createWorkspaceGrillAdapter(options: {
  port: {
    setFrontier(
      grillId: string,
      frontier: GrillFrontier,
      now: number,
    ): { frontier: GrillFrontier } | undefined;
    setIssueProposal(
      grillId: string,
      issues: GrillProposedIssue[],
      now: number,
    ): { issueProposal?: GrillIssueProposal } | undefined;
    setWriteup(
      grillId: string,
      writeup: { title: string; body: string },
      now: number,
    ): { writeup?: { title: string; body: string } } | undefined;
  };
}): WorkspaceAgentAdapter {
  return {
    capability: {
      id: "workspace.grill",
      applies({ grantContext }) {
        return Boolean(grantContext?.grillId);
      },
      createUpstream({ grantContext }) {
        const grillId = grantContext?.grillId;
        if (!grillId) {
          throw new Error("A grill id is required for the workspace grill capability");
        }
        return createWorkspaceGrillMcpUpstream({
          port: {
            setFrontier(questions, drafts) {
              const grill = options.port.setFrontier(
                grillId,
                { questions, drafts: drafts ?? {} },
                Date.now(),
              );
              if (!grill) throw new Error(`Grill not found: ${grillId}`);
              return grill.frontier;
            },
            proposeIssues(issues) {
              const grill = options.port.setIssueProposal(
                grillId,
                issues,
                Date.now(),
              );
              if (!grill?.issueProposal)
                throw new Error(`Grill not found: ${grillId}`);
              return grill.issueProposal;
            },
            proposeWriteup(writeup) {
              const grill = options.port.setWriteup(
                grillId,
                writeup,
                Date.now(),
              );
              if (!grill?.writeup)
                throw new Error(`Grill not found: ${grillId}`);
              return grill.writeup;
            },
          },
        });
      },
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
            createUpstream: ({ workspace, sandbox, grantContext }) => {
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
              const base = grantContext?.repositoryBase ?? options.base;
              return createGitHubMcpUpstream({
                octokit: options.octokit,
                repository: options.repository,
                workspace: workspace.path,
                branch: workspace.git.branch,
                baseCommit: workspace.git.baseCommit,
                base,
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
