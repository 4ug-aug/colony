import type { McpUpstream } from "./gateway";

export interface WorkspaceAuthor {
  kind: "agent";
  id: string;
  name: string;
  image?: string;
}
export interface WorkspaceMessage {
  author: { kind: "user" | "agent"; id: string; name: string; image?: string };
  text: string;
  createdAt: number;
}
export interface WorkspaceRoomPort {
  listMessages(roomId: string): readonly WorkspaceMessage[];
  /** Complete root plus chronological replies for a thread-scoped read. */
  listThreadMessages(
    roomId: string,
    rootId: string,
  ): readonly WorkspaceMessage[];
  postMessage(input: {
    roomId: string;
    author: WorkspaceAuthor;
    text: string;
    rootId?: string;
  }): void;
}

const relativeDivisions: [ms: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [1000 * 60 * 60 * 24 * 365, "year"],
  [1000 * 60 * 60 * 24 * 30, "month"],
  [1000 * 60 * 60 * 24 * 7, "week"],
  [1000 * 60 * 60 * 24, "day"],
  [1000 * 60 * 60, "hour"],
  [1000 * 60, "minute"],
  [1000, "second"],
];
const relativeTimeFormat = new Intl.RelativeTimeFormat("en-US", {
  numeric: "auto",
});

/** Human-friendly relative timestamp, e.g. "5 minutes ago" or "yesterday". */
export function formatRelativeTime(createdAt: number, now: number): string {
  const diffMs = createdAt - now;
  const abs = Math.abs(diffMs);
  for (const [ms, unit] of relativeDivisions) {
    if (abs >= ms || unit === "second") {
      return relativeTimeFormat.format(Math.round(diffMs / ms), unit);
    }
  }
  return relativeTimeFormat.format(0, "second");
}

export function formatWorkspaceTranscript(
  messages: readonly WorkspaceMessage[],
  now: number,
): string {
  if (!messages.length) return "No workspace messages.";
  return messages
    .map(
      ({ author, text, createdAt }) =>
        `[${author.name} · ${author.kind} · ${formatRelativeTime(createdAt, now)}]\n${text}`,
    )
    .join("\n\n");
}

export function createWorkspaceMcpUpstream(options: {
  port: WorkspaceRoomPort;
  roomId: string;
  agent: { id: string; name: string; image?: string };
  /** Invocation root for a thread-scoped run: binds posts as replies to this root. */
  rootId?: string;
  /** Set only for an in-thread invocation: read_messages returns this root's thread instead of the flat Room. */
  threadReadRootId?: string;
  now?: () => number;
}): McpUpstream {
  const now = options.now ?? (() => Date.now());
  return {
    async listTools() {
      return [
        {
          name: "workspace.read_messages",
          description:
            "Read recent messages in the current room as a chronological, human-readable transcript. Each entry is headed by author, role, and relative time.",
          inputSchema: {
            type: "object",
            properties: { limit: { type: "number" } },
          },
        },
        {
          name: "workspace.post_message",
          description:
            "Post a progress update or clarifying question into the current room. Do not use this for your final result; your final response is automatically shown in the room as the run result.",
          inputSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
        },
      ];
    },

    async callTool(name, args) {
      if (name === "workspace.read_messages") {
        const at = now();
        if (options.threadReadRootId) {
          const messages = options.port.listThreadMessages(
            options.roomId,
            options.threadReadRootId,
          );
          return {
            content: [
              { type: "text", text: formatWorkspaceTranscript(messages, at) },
            ],
          };
        }
        const limit =
          typeof args.limit === "number" && args.limit > 0 ? args.limit : 50;
        const messages = options.port
          .listMessages(options.roomId)
          .slice(-limit);
        return {
          content: [
            { type: "text", text: formatWorkspaceTranscript(messages, at) },
          ],
        };
      }
      if (name === "workspace.post_message") {
        const text = typeof args.text === "string" ? args.text.trim() : "";
        if (!text) throw new Error("A non-empty text is required");
        options.port.postMessage({
          roomId: options.roomId,
          author: { kind: "agent", ...options.agent },
          text,
          ...(options.rootId ? { rootId: options.rootId } : {}),
        });
        return { posted: true };
      }
      throw new Error(`Unknown workspace tool: ${name}`);
    },
  };
}
