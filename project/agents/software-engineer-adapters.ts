import type { Octokit } from "octokit";
import { createGitHubRepositoryCheckoutSource } from "../inputs/github";
import { createAsanaMcpUpstream } from "../mcp/asana";
import { createGitHubMcpUpstream } from "../mcp/github";
import { createLinearMcpUpstream } from "../mcp/linear";
import {
  createWorkspaceMcpUpstream,
  type WorkspaceRoomPort,
} from "../mcp/workspace";
import type { SoftwareEngineerAdapter } from "./software-engineer";

type WorkspaceAgentIdentity = { id: string; name: string; image?: string };

export function createWorkspaceSoftwareEngineerAdapter(options: {
  port: WorkspaceRoomPort;
  agent:
    | WorkspaceAgentIdentity
    | ((grantContext: unknown) => WorkspaceAgentIdentity);
}): SoftwareEngineerAdapter {
  return {
    capability: {
      id: "workspace.room",
      applies({ grantContext }) {
        return Boolean(
          (grantContext as { roomId?: string } | undefined)?.roomId,
        );
      },
      createUpstream({ grantContext }) {
        const roomId = (grantContext as { roomId?: string } | undefined)
          ?.roomId;
        if (!roomId) {
          throw new Error("A room id is required for the workspace capability");
        }
        const agent =
          typeof options.agent === "function"
            ? options.agent(grantContext)
            : options.agent;
        return createWorkspaceMcpUpstream({
          port: options.port,
          roomId,
          agent,
        });
      },
    },
  };
}

export function createLinearSoftwareEngineerAdapter(options: {
  accessToken: string;
}): SoftwareEngineerAdapter {
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
}): SoftwareEngineerAdapter {
  return {
    capability: {
      id: "asana.tasks",
      createUpstream: () => createAsanaMcpUpstream(options),
    },
  };
}

export function createGitHubSoftwareEngineerAdapter(options: {
  octokit: Octokit;
  repository: string;
  base: string;
  verifyCommand?: string;
}): SoftwareEngineerAdapter {
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
                    .slice(-20_000);
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
