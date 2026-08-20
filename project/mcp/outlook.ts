import { createHmac, timingSafeEqual } from "node:crypto";
import type { McpTool, McpUpstream } from "./gateway";

const graphUrl = "https://graph.microsoft.com/v1.0";
const loginUrl = "https://login.microsoftonline.com";
const sendDenied = "Outlook cannot send email. Create a draft instead.";
const textBodyPrefer = 'outlook.body-content-type="text"';
const messageSelect =
  "id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isDraft,conversationId,webLink";

export const OUTLOOK_OAUTH_CALLBACK_PATH =
  "/api/account/connections/outlook/oauth/callback";

export const outlookNotConnectedMessage =
  "Connect Outlook in Account settings";

export const OUTLOOK_OAUTH_SCOPES =
  "offline_access User.Read Mail.ReadWrite" as const;

export const outlookTools = [
  "outlook.search_messages",
  "outlook.get_message",
  "outlook.create_draft",
  "outlook.create_reply_draft",
] as const;

const tools: readonly McpTool[] = [
  {
    name: "outlook.search_messages",
    description:
      "Search or list Outlook mail. Omit query to list recent messages. Does not send mail.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1 },
        top: { type: "integer", minimum: 1, maximum: 50 },
        folder: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "outlook.get_message",
    description: "Read one Outlook message by id. Does not send mail.",
    inputSchema: {
      type: "object",
      properties: { messageId: { type: "string", minLength: 1 } },
      required: ["messageId"],
      additionalProperties: false,
    },
  },
  {
    name: "outlook.create_draft",
    description:
      "Create an Outlook draft. The user sends it from Outlook. Never sends.",
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
        },
        subject: { type: "string", minLength: 1 },
        body: { type: "string" },
        cc: { type: "array", items: { type: "string", minLength: 1 } },
      },
      required: ["to", "subject"],
      additionalProperties: false,
    },
  },
  {
    name: "outlook.create_reply_draft",
    description:
      "Create a reply draft for an existing message. Never sends.",
    inputSchema: {
      type: "object",
      properties: {
        messageId: { type: "string", minLength: 1 },
        body: { type: "string" },
        replyAll: { type: "boolean" },
      },
      required: ["messageId"],
      additionalProperties: false,
    },
  },
];

export type MicrosoftOAuthConfig = {
  clientId: string;
  clientSecret: string;
  tenant: string;
};

export type OutlookSecret = {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
};

export type OutlookMessage = {
  id: string;
  subject?: string;
  from?: string;
  to: string[];
  cc: string[];
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: string;
  isDraft?: boolean;
  conversationId?: string;
  webLink?: string;
};

type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

function requireOnly(
  args: Record<string, unknown>,
  keys: readonly string[],
): void {
  if (Object.keys(args).some((key) => !keys.includes(key)))
    throw new Error("Invalid Outlook tool arguments");
}

function nonEmptyString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

function emails(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${label} is required`);
  return value.map((item) => nonEmptyString(item, `${label} must be email addresses`));
}

function optionalEmails(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  return emails(value, label);
}

function recipients(addresses: readonly string[]) {
  return addresses.map((address) => ({ emailAddress: { address } }));
}

function addressOf(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const nested = (value as { emailAddress?: { address?: unknown } }).emailAddress
    ?.address;
  return typeof nested === "string" && nested.trim() ? nested.trim() : undefined;
}

function addressList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const address = addressOf(item);
    return address ? [address] : [];
  });
}

function mapMessage(
  value: unknown,
  includeBody: boolean,
): OutlookMessage {
  if (!value || typeof value !== "object")
    throw new Error("Outlook returned an invalid response");
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) throw new Error("Outlook returned an invalid response");
  const body =
    includeBody &&
    row.body &&
    typeof row.body === "object" &&
    typeof (row.body as { content?: unknown }).content === "string"
      ? (row.body as { content: string }).content
      : undefined;
  return {
    id,
    ...(typeof row.subject === "string" ? { subject: row.subject } : {}),
    ...(addressOf(row.from) ? { from: addressOf(row.from) } : {}),
    to: addressList(row.toRecipients),
    cc: addressList(row.ccRecipients),
    ...(typeof row.receivedDateTime === "string"
      ? { receivedDateTime: row.receivedDateTime }
      : {}),
    ...(typeof row.bodyPreview === "string"
      ? { bodyPreview: row.bodyPreview }
      : {}),
    ...(body !== undefined ? { body } : {}),
    ...(typeof row.isDraft === "boolean" ? { isDraft: row.isDraft } : {}),
    ...(typeof row.conversationId === "string"
      ? { conversationId: row.conversationId }
      : {}),
    ...(typeof row.webLink === "string" ? { webLink: row.webLink } : {}),
  };
}

function folderPath(folder: string | undefined): string {
  if (!folder) return "/me/messages";
  if (!/^[A-Za-z0-9-]+$/.test(folder))
    throw new Error("Outlook folder must be a well-known name such as inbox or drafts");
  return `/me/mailFolders/${folder}/messages`;
}

function parseSecret(raw: string): OutlookSecret {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as OutlookSecret).refreshToken === "string" &&
      (parsed as OutlookSecret).refreshToken.trim()
    ) {
      const secret = parsed as OutlookSecret;
      return {
        refreshToken: secret.refreshToken,
        ...(typeof secret.accessToken === "string"
          ? { accessToken: secret.accessToken }
          : {}),
        ...(typeof secret.expiresAt === "number" ? { expiresAt: secret.expiresAt } : {}),
      };
    }
  } catch {
    // pasted refresh token
  }
  return { refreshToken: nonEmptyString(raw, "Outlook token is required") };
}

function serializeSecret(tokens: TokenSet): string {
  return JSON.stringify({
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    expiresAt: tokens.expiresAt,
  } satisfies OutlookSecret);
}

function graphError(status: number): Error {
  if (status === 401 || status === 403)
    return new Error("Outlook access was denied");
  if (status === 404) return new Error("Outlook resource was not found");
  if (status === 429) return new Error("Outlook rate limit exceeded");
  return new Error(`Outlook request failed (${status})`);
}

function signState(payload: string, secret: string): string {
  const body = Buffer.from(payload).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function readState(
  state: string,
  secret: string,
  now: number,
): { userId: string } {
  const [body, mac] = state.split(".");
  if (!body || !mac) throw new Error("Outlook OAuth state is invalid");
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    throw new Error("Outlook OAuth state is invalid");
  let parsed: { exp?: unknown; uid?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      exp?: unknown;
      uid?: unknown;
    };
  } catch {
    throw new Error("Outlook OAuth state is invalid");
  }
  if (typeof parsed.exp !== "number" || parsed.exp < now)
    throw new Error("Outlook OAuth state expired");
  if (typeof parsed.uid !== "string" || !parsed.uid)
    throw new Error("Outlook OAuth state is invalid");
  return { userId: parsed.uid };
}

export function isOutlookOAuthCallbackPath(pathname: string): boolean {
  return pathname === OUTLOOK_OAUTH_CALLBACK_PATH;
}

export function readMicrosoftOAuthConfig(
  environment: Record<string, string | undefined> = process.env,
): MicrosoftOAuthConfig | undefined {
  const clientId = environment.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = environment.MICROSOFT_CLIENT_SECRET?.trim();
  if (Boolean(clientId) !== Boolean(clientSecret))
    throw new Error(
      "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be configured together",
    );
  if (!clientId || !clientSecret) return undefined;
  return {
    clientId,
    clientSecret,
    tenant: environment.MICROSOFT_TENANT?.trim() || "common",
  };
}

export function outlookRedirectUri(
  origin: string,
  environment: Record<string, string | undefined> = process.env,
): string {
  const base = (environment.BETTER_AUTH_URL || origin).replace(/\/$/, "");
  return `${base}${OUTLOOK_OAUTH_CALLBACK_PATH}`;
}

export function createOutlookAuthorizeUrl(options: {
  clientId: string;
  tenant: string;
  redirectUri: string;
  secret: string;
  userId: string;
  now?: () => number;
}): string {
  const exp = (options.now?.() ?? Date.now()) + 10 * 60_000;
  const authorize = new URL(
    `${loginUrl}/${encodeURIComponent(options.tenant)}/oauth2/v2.0/authorize`,
  );
  authorize.searchParams.set("client_id", options.clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", options.redirectUri);
  authorize.searchParams.set("response_mode", "query");
  authorize.searchParams.set("scope", OUTLOOK_OAUTH_SCOPES);
  authorize.searchParams.set("prompt", "select_account");
  authorize.searchParams.set(
    "state",
    signState(JSON.stringify({ exp, uid: options.userId }), options.secret),
  );
  return authorize.toString();
}

async function exchangeToken(
  params: URLSearchParams,
  options: {
    tenant: string;
    fetch: typeof fetch;
  },
): Promise<TokenSet> {
  let response: Response;
  try {
    response = await options.fetch(
      `${loginUrl}/${encodeURIComponent(options.tenant)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      },
    );
  } catch {
    throw new Error("Outlook token request failed");
  }
  if (!response.ok) throw new Error("Outlook access was denied");
  let payload: {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new Error("Outlook returned an invalid token response");
  }
  if (
    typeof payload.access_token !== "string" ||
    !payload.access_token ||
    typeof payload.refresh_token !== "string" ||
    !payload.refresh_token
  )
    throw new Error("Outlook access was denied");
  const expiresIn =
    typeof payload.expires_in === "number" && payload.expires_in > 0
      ? payload.expires_in
      : 3600;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + (expiresIn - 60) * 1000,
  };
}

export async function completeOutlookOAuth(options: {
  code: string;
  state: string;
  redirectUri: string;
  secret: string;
  clientId: string;
  clientSecret: string;
  tenant: string;
  fetch?: typeof fetch;
  now?: () => number;
}): Promise<{ account: string; secret: string; userId: string }> {
  const { userId } = readState(
    options.state,
    options.secret,
    options.now?.() ?? Date.now(),
  );
  const request = options.fetch ?? fetch;
  const tokens = await exchangeToken(
    new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      code: options.code,
      redirect_uri: options.redirectUri,
      grant_type: "authorization_code",
      scope: OUTLOOK_OAUTH_SCOPES,
    }),
    { tenant: options.tenant, fetch: request },
  );
  let profile: Response;
  try {
    profile = await request(`${graphUrl}/me?$select=mail,userPrincipalName`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
  } catch {
    throw new Error("Outlook profile request failed");
  }
  if (!profile.ok) throw new Error("Outlook access was denied");
  let body: { mail?: unknown; userPrincipalName?: unknown };
  try {
    body = (await profile.json()) as typeof body;
  } catch {
    throw new Error("Outlook returned an invalid response");
  }
  const account =
    (typeof body.mail === "string" && body.mail.trim()) ||
    (typeof body.userPrincipalName === "string" &&
      body.userPrincipalName.trim()) ||
    "";
  if (!account) throw new Error("Outlook account email was not available");
  return { account, secret: serializeSecret(tokens), userId };
}

export function createOutlookMcpUpstream(options: {
  secret: string;
  clientId: string;
  clientSecret: string;
  tenant?: string;
  persistSecret?: (secret: string) => void;
  fetch?: typeof fetch;
  now?: () => number;
}): McpUpstream {
  const requestFn = options.fetch ?? fetch;
  const tenant = options.tenant?.trim() || "common";
  const now = options.now ?? Date.now;
  let tokens: TokenSet | undefined;
  const parsed = parseSecret(options.secret);
  if (parsed.accessToken && parsed.expiresAt) {
    tokens = {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
    };
  }
  let refreshToken = parsed.refreshToken;
  // ponytail: one in-flight refresh; per-account locks if many mailboxes share a process
  let pendingRefresh: Promise<string> | undefined;

  const persist = (next: TokenSet) => {
    tokens = next;
    refreshToken = next.refreshToken;
    try {
      options.persistSecret?.(serializeSecret(next));
    } catch {
      // in-memory token still works for this run
    }
  };

  const refresh = async (): Promise<string> => {
    const next = await exchangeToken(
      new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: OUTLOOK_OAUTH_SCOPES,
      }),
      { tenant, fetch: requestFn },
    );
    persist(next);
    return next.accessToken;
  };

  const accessToken = async (): Promise<string> => {
    if (tokens && tokens.expiresAt > now()) return tokens.accessToken;
    pendingRefresh ??= refresh().finally(() => {
      pendingRefresh = undefined;
    });
    return pendingRefresh;
  };

  const graph = async (
    path: string,
    init?: RequestInit,
    retried = false,
  ): Promise<unknown> => {
    if (/\/send(Mail)?$/i.test(path.split("?")[0] ?? "")) throw new Error(sendDenied);
    const token = await accessToken();
    let response: Response;
    try {
      response = await requestFn(`${graphUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          Prefer: textBodyPrefer,
          ...init?.headers,
        },
      });
    } catch {
      throw new Error("Outlook request failed");
    }
    if (response.status === 401 && !retried) {
      tokens = undefined;
      pendingRefresh = undefined;
      await refresh();
      return graph(path, init, true);
    }
    if (!response.ok) throw graphError(response.status);
    if (response.status === 204) return {};
    try {
      return await response.json();
    } catch {
      throw new Error("Outlook returned an invalid response");
    }
  };

  return {
    listTools: async () => tools,
    async callTool(name, args) {
      if (name.includes("send")) throw new Error(sendDenied);
      if (name === "outlook.search_messages") {
        requireOnly(args, ["query", "top", "folder"]);
        if (
          args.top !== undefined &&
          (!Number.isInteger(args.top) ||
            (args.top as number) < 1 ||
            (args.top as number) > 50)
        )
          throw new Error("Outlook top must be an integer from 1 to 50");
        const query =
          args.query === undefined
            ? undefined
            : nonEmptyString(args.query, "Outlook query must be a non-empty string");
        const folder =
          args.folder === undefined
            ? undefined
            : nonEmptyString(args.folder, "Outlook folder must be a non-empty string");
        const params = [
          `$select=${encodeURIComponent(messageSelect)}`,
          `$top=${(args.top as number | undefined) ?? 25}`,
        ];
        const headers: Record<string, string> = {};
        if (query) {
          params.push(
            `$search=${encodeURIComponent(`"${query.replaceAll('"', "")}"`)}`,
          );
          // Mail $search does not require this; keep it for Graph advanced-query quirks.
          headers.ConsistencyLevel = "eventual";
        }
        const response = (await graph(
          `${folderPath(folder)}?${params.join("&")}`,
          { headers },
        )) as { value?: unknown; "@odata.nextLink"?: unknown };
        const rows = Array.isArray(response.value) ? response.value : [];
        return {
          messages: rows.map((row) => mapMessage(row, false)),
          ...(typeof response["@odata.nextLink"] === "string"
            ? { nextLink: response["@odata.nextLink"] }
            : {}),
        };
      }
      if (name === "outlook.get_message") {
        requireOnly(args, ["messageId"]);
        const messageId = nonEmptyString(
          args.messageId,
          "Outlook messageId is required",
        );
        return mapMessage(
          await graph(
            `/me/messages/${encodeURIComponent(messageId)}?$select=${encodeURIComponent(`${messageSelect},body`)}`,
          ),
          true,
        );
      }
      if (name === "outlook.create_draft") {
        requireOnly(args, ["to", "subject", "body", "cc"]);
        const to = emails(args.to, "Outlook to");
        const cc = optionalEmails(args.cc, "Outlook cc");
        const subject = nonEmptyString(args.subject, "Outlook subject is required");
        const body =
          args.body === undefined
            ? ""
            : typeof args.body === "string"
              ? args.body
              : (() => {
                  throw new Error("Outlook body must be a string");
                })();
        return mapMessage(
          await graph("/me/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject,
              body: { contentType: "text", content: body },
              toRecipients: recipients(to),
              ...(cc ? { ccRecipients: recipients(cc) } : {}),
            }),
          }),
          true,
        );
      }
      if (name === "outlook.create_reply_draft") {
        requireOnly(args, ["messageId", "body", "replyAll"]);
        const messageId = nonEmptyString(
          args.messageId,
          "Outlook messageId is required",
        );
        if (args.replyAll !== undefined && typeof args.replyAll !== "boolean")
          throw new Error("Outlook replyAll must be a boolean");
        if (args.body !== undefined && typeof args.body !== "string")
          throw new Error("Outlook body must be a string");
        const action = args.replyAll === true ? "createReplyAll" : "createReply";
        return mapMessage(
          await graph(
            `/me/messages/${encodeURIComponent(messageId)}/${action}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                typeof args.body === "string" ? { comment: args.body } : {},
              ),
            },
          ),
          true,
        );
      }
      throw new Error(`Unknown Outlook tool: ${name}`);
    },
  };
}
