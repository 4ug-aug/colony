import type { McpUpstream } from "./gateway";

export interface WorkspaceAuthor { kind: "agent"; id: string; name: string; image?: string }
export interface WorkspaceMessage {
  author: { kind: "user" | "agent"; id: string; name: string; image?: string };
  text: string;
  createdAt: number;
}
export interface WorkspaceRoomPort {
  listMessages(roomId: string): readonly WorkspaceMessage[];
  postMessage(input: { roomId: string; author: WorkspaceAuthor; text: string }): void;
}

const friendlyTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Human-friendly absolute timestamp, e.g. "Jul 27, 2026, 2:32 PM UTC". */
export function formatFriendlyTime(createdAt: number): string {
  return `${friendlyTimeFormat.format(new Date(createdAt))} UTC`;
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
const relativeTimeFormat = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

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

export function createWorkspaceMcpUpstream(options: {
  port: WorkspaceRoomPort;
  roomId: string;
  agent: { id: string; name: string; image?: string };
  now?: () => number;
}): McpUpstream {
  const now = options.now ?? (() => Date.now());
  return {
    async listTools() {
      return [
        {
          name: "workspace.read_messages",
          description:
            "Read recent messages in the current room. Each message includes a friendly `time` (e.g. \"Jul 27, 2026, 2:32 PM UTC\") and `relativeTime` (e.g. \"5 minutes ago\") alongside the raw `createdAt` epoch milliseconds.",
          inputSchema: { type: "object", properties: { limit: { type: "number" } } },
        },
        {
          name: "workspace.post_message",
          description: "Post a message from you into the current room.",
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
        const limit = typeof args.limit === "number" && args.limit > 0 ? args.limit : 50;
        const at = now();
        const messages = options.port
          .listMessages(options.roomId)
          .slice(-limit)
          .map((message) => ({
            ...message,
            time: formatFriendlyTime(message.createdAt),
            relativeTime: formatRelativeTime(message.createdAt, at),
          }));
        return { messages };
      }
      if (name === "workspace.post_message") {
        const text = typeof args.text === "string" ? args.text.trim() : "";
        if (!text) throw new Error("A non-empty text is required");
        options.port.postMessage({
          roomId: options.roomId,
          author: { kind: "agent", ...options.agent },
          text,
        });
        return { posted: true };
      }
      throw new Error(`Unknown workspace tool: ${name}`);
    },
  };
}
