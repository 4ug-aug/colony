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
  createWorkspaceDocsMcpUpstream,
  type WorkspaceDocsPort,
} from "../mcp/workspace-docs";
import {
  createWorkspaceGrillMcpUpstream,
  type GrillFrontier,
  type GrillIssueProposal,
  type GrillMaterializeFile,
  type GrillProposedIssue,
} from "../mcp/workspace-grill";
import { commandFailure } from "../sandboxes";
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
          ...(grantContext?.rootId ? { rootId: grantContext.rootId } : {}),
          ...(grantContext?.threadReadRootId
            ? { threadReadRootId: grantContext.threadReadRootId }
            : {}),
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
      createUpstream({ grantContext }) {
        const agentDefinitionId = grantContext?.agentDefinitionId;
        if (!agentDefinitionId) {
          throw new Error(
            "An agent definition id is required for the workspace issues capability",
          );
        }
        return createWorkspaceIssuesMcpUpstream({
          port: {
            ...options.port,
            createIssue: (input) =>
              options.port.createIssue({
                ...input,
                createdBy: { kind: "agent", id: agentDefinitionId },
              }),
          },
          ...(options.listAssignableOwners
            ? { listAssignableOwners: options.listAssignableOwners }
            : {}),
        });
      },
    },
  };
}

export function createWorkspaceDocsAdapter(options: {
  port: WorkspaceDocsPort;
}): WorkspaceAgentAdapter {
  return {
    capability: {
      id: "workspace.docs",
      applies({ grantContext }) {
        return Boolean(grantContext?.grillId);
      },
      createUpstream: () => createWorkspaceDocsMcpUpstream(options),
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
      files?: GrillMaterializeFile[],
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
          throw new Error(
            "A grill id is required for the workspace grill capability",
          );
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
            proposeIssues(issues, files) {
              const grill = options.port.setIssueProposal(
                grillId,
                issues,
                Date.now(),
                files,
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
  /** After a successful Issue-linked publish, bind the PR head branch on the Issue. */
  bindIssueBranch?: (issueId: string, branch: string) => void;
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
        fallbackRevision: options.base,
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
              const branch = workspace.git.branch;
              const issueId = grantContext?.issueId;
              const upstream = createGitHubMcpUpstream({
                octokit: options.octokit,
                repository: options.repository,
                workspace: workspace.path,
                branch,
                baseCommit: workspace.git.baseCommit,
                base,
                verify: async () => {
                  const result = await sandbox.exec({
                    command: ["sh", "-lc", options.verifyCommand!],
                    workdir: "/work",
                  });
                  if (result.exitCode === 0) return;
                  throw new Error(
                    commandFailure("Verification", result, STEP_TEXT_LIMIT),
                  );
                },
              });
              if (!options.bindIssueBranch || !issueId) return upstream;
              return {
                listTools: () => upstream.listTools(),
                async callTool(name, args) {
                  const result = await upstream.callTool(name, args);
                  if (name === "github.create_pull_request") {
                    try {
                      options.bindIssueBranch!(issueId, branch);
                    } catch (error) {
                      console.error(
                        "Failed to bind Issue branch after pull request",
                        issueId,
                        branch,
                        error,
                      );
                    }
                  }
                  return result;
                },
              };
            },
          },
        }
      : {}),
  };
}

export type { WorkspaceAgentAdapter };
