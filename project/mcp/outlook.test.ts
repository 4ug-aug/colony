import { expect, test } from "bun:test";
import {
  completeOutlookOAuth,
  createOutlookAuthorizeUrl,
  createOutlookMcpUpstream,
  isOutlookOAuthCallbackPath,
  OUTLOOK_OAUTH_CALLBACK_PATH,
  OUTLOOK_OAUTH_SCOPES,
  readMicrosoftOAuthConfig,
} from "./outlook";
import { createMcpGateway } from "./gateway";
import { createOutlookAdapter } from "../agents/software-engineer-adapters";

const clientId = "client-id";
const clientSecret = "client-secret";
const refreshToken = "refresh-token";
const accessToken = "access-token";

const graphMessage = {
  id: "msg-1",
  subject: "Hello",
  from: { emailAddress: { address: "ada@example.com" } },
  toRecipients: [{ emailAddress: { address: "bob@example.com" } }],
  ccRecipients: [{ emailAddress: { address: "cc@example.com" } }],
  receivedDateTime: "2026-08-20T12:00:00Z",
  bodyPreview: "Hi there",
  body: { contentType: "text", content: "Hi there, full body" },
  isDraft: false,
  conversationId: "conv-1",
  webLink: "https://outlook.office.com/mail/msg-1",
};

const mapped = {
  id: "msg-1",
  subject: "Hello",
  from: "ada@example.com",
  to: ["bob@example.com"],
  cc: ["cc@example.com"],
  receivedDateTime: "2026-08-20T12:00:00Z",
  bodyPreview: "Hi there",
  isDraft: false,
  conversationId: "conv-1",
  webLink: "https://outlook.office.com/mail/msg-1",
};

const tokenResponse = {
  access_token: accessToken,
  refresh_token: "rotated-refresh",
  expires_in: 3600,
};

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}

test("Outlook lists only draft-safe tools and refuses send", async () => {
  const upstream = createOutlookMcpUpstream({
    secret: refreshToken,
    clientId,
    clientSecret,
    fetch: async () => jsonResponse(tokenResponse),
  });
  const names = (await upstream.listTools()).map((tool) => tool.name);
  expect(names).toEqual([
    "outlook.search_messages",
    "outlook.get_message",
    "outlook.create_draft",
    "outlook.create_reply_draft",
  ]);
  expect(names.some((name) => name.includes("send"))).toBe(false);
  await expect(upstream.callTool("outlook.send_message", {})).rejects.toThrow(
    "Outlook cannot send email",
  );
  await expect(upstream.callTool("outlook.sendMail", {})).rejects.toThrow(
    "Outlook cannot send email",
  );
});

test("Outlook maps search and read, sending ConsistencyLevel for $search", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const upstream = createOutlookMcpUpstream({
    secret: JSON.stringify({
      refreshToken,
      accessToken,
      expiresAt: Date.now() + 60_000,
    }),
    clientId,
    clientSecret,
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).includes("$search")) {
        return jsonResponse({ value: [graphMessage] });
      }
      return jsonResponse(graphMessage);
    },
  });

  await expect(
    upstream.callTool("outlook.search_messages", { query: "invoice", top: 10 }),
  ).resolves.toEqual({ messages: [mapped] });
  await expect(
    upstream.callTool("outlook.get_message", { messageId: "msg-1" }),
  ).resolves.toEqual({ ...mapped, body: "Hi there, full body" });

  expect(requests.map(({ url }) => url)).toEqual([
    'https://graph.microsoft.com/v1.0/me/messages?$select=id%2Csubject%2Cfrom%2CtoRecipients%2CccRecipients%2CreceivedDateTime%2CbodyPreview%2CisDraft%2CconversationId%2CwebLink&$top=10&$search=%22invoice%22',
    "https://graph.microsoft.com/v1.0/me/messages/msg-1?$select=id%2Csubject%2Cfrom%2CtoRecipients%2CccRecipients%2CreceivedDateTime%2CbodyPreview%2CisDraft%2CconversationId%2CwebLink%2Cbody",
  ]);
  expect(new Headers(requests[0]?.init?.headers).get("ConsistencyLevel")).toBe(
    "eventual",
  );
  expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(
    `Bearer ${accessToken}`,
  );
  expect(new Headers(requests[1]?.init?.headers).get("prefer")).toBe(
    'outlook.body-content-type="text"',
  );
});

test("Outlook creates drafts and reply drafts without send endpoints", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const upstream = createOutlookMcpUpstream({
    secret: JSON.stringify({
      refreshToken,
      accessToken,
      expiresAt: Date.now() + 60_000,
    }),
    clientId,
    clientSecret,
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse({ ...graphMessage, isDraft: true });
    },
  });

  await upstream.callTool("outlook.create_draft", {
    to: ["bob@example.com"],
    cc: ["cc@example.com"],
    subject: "Hello",
    body: "Draft body",
  });
  await upstream.callTool("outlook.create_reply_draft", {
    messageId: "msg-1",
    body: "Thanks",
    replyAll: true,
  });

  expect(requests.map(({ url, init }) => [init?.method, url])).toEqual([
    ["POST", "https://graph.microsoft.com/v1.0/me/messages"],
    [
      "POST",
      "https://graph.microsoft.com/v1.0/me/messages/msg-1/createReplyAll",
    ],
  ]);
  expect(JSON.parse(requests[0]?.init?.body as string)).toEqual({
    subject: "Hello",
    body: { contentType: "text", content: "Draft body" },
    toRecipients: [{ emailAddress: { address: "bob@example.com" } }],
    ccRecipients: [{ emailAddress: { address: "cc@example.com" } }],
  });
  expect(JSON.parse(requests[1]?.init?.body as string)).toEqual({
    comment: "Thanks",
  });
  expect(requests.some(({ url }) => /send/i.test(url))).toBe(false);
});

test("Outlook refreshes on 401, persists rotated refresh tokens, and hides secrets", async () => {
  const persisted: string[] = [];
  const requests: string[] = [];
  let graphCalls = 0;
  const upstream = createOutlookMcpUpstream({
    secret: JSON.stringify({
      refreshToken,
      accessToken: "stale",
      expiresAt: Date.now() + 60_000,
    }),
    clientId,
    clientSecret,
    persistSecret: (secret) => persisted.push(secret),
    fetch: async (url) => {
      requests.push(String(url));
      if (String(url).includes("/oauth2/v2.0/token"))
        return jsonResponse(tokenResponse);
      graphCalls += 1;
      if (graphCalls === 1)
        return jsonResponse({ error: refreshToken }, 401);
      return jsonResponse({ value: [graphMessage] });
    },
  });

  const gateway = createMcpGateway({
    upstream,
    createToken: () => "run-token",
  });
  const session = gateway.createSession({
    tools: [
      "outlook.search_messages",
      "outlook.get_message",
      "outlook.create_draft",
      "outlook.create_reply_draft",
    ],
    expiresAt: new Date(Date.now() + 60_000),
  });
  await expect(
    gateway.callTool(session.token, "outlook.search_messages", {}),
  ).resolves.toEqual({ messages: [mapped] });
  expect(requests).toEqual([
    "https://graph.microsoft.com/v1.0/me/messages?$select=id%2Csubject%2Cfrom%2CtoRecipients%2CccRecipients%2CreceivedDateTime%2CbodyPreview%2CisDraft%2CconversationId%2CwebLink&$top=25",
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    "https://graph.microsoft.com/v1.0/me/messages?$select=id%2Csubject%2Cfrom%2CtoRecipients%2CccRecipients%2CreceivedDateTime%2CbodyPreview%2CisDraft%2CconversationId%2CwebLink&$top=25",
  ]);
  expect(JSON.parse(persisted[0]!)).toMatchObject({
    refreshToken: "rotated-refresh",
    accessToken,
  });
  try {
    await gateway.callTool(session.token, "outlook.search_messages", {});
  } catch (error) {
    expect(String(error)).not.toContain(refreshToken);
  }
});

test("Outlook OAuth helpers sign state, exchange the code, and read /me", async () => {
  expect(isOutlookOAuthCallbackPath(OUTLOOK_OAUTH_CALLBACK_PATH)).toBe(true);
  expect(readMicrosoftOAuthConfig({})).toBeUndefined();
  expect(() =>
    readMicrosoftOAuthConfig({ MICROSOFT_CLIENT_ID: clientId }),
  ).toThrow("configured together");
  expect(
    readMicrosoftOAuthConfig({
      MICROSOFT_CLIENT_ID: clientId,
      MICROSOFT_CLIENT_SECRET: clientSecret,
    }),
  ).toEqual({ clientId, clientSecret, tenant: "common" });

  const url = createOutlookAuthorizeUrl({
    clientId,
    tenant: "common",
    redirectUri: "http://localhost:3011/api/account/connections/outlook/oauth/callback",
    secret: "signing-secret",
    userId: "user-1",
    now: () => 1_000,
  });
  const parsed = new URL(url);
  expect(parsed.origin + parsed.pathname).toBe(
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  );
  expect(parsed.searchParams.get("scope")).toBe(OUTLOOK_OAUTH_SCOPES);
  expect(parsed.searchParams.get("scope")).not.toContain("Mail.Send");

  const requests: string[] = [];
  const completed = await completeOutlookOAuth({
    code: "auth-code",
    state: parsed.searchParams.get("state")!,
    redirectUri: parsed.searchParams.get("redirect_uri")!,
    secret: "signing-secret",
    clientId,
    clientSecret,
    tenant: "common",
    now: () => 1_000,
    fetch: async (url) => {
      requests.push(String(url));
      if (String(url).includes("/token")) return jsonResponse(tokenResponse);
      return jsonResponse({ mail: "ada@example.com" });
    },
  });
  expect(completed.account).toBe("ada@example.com");
  expect(completed.userId).toBe("user-1");
  expect(JSON.parse(completed.secret)).toMatchObject({
    refreshToken: "rotated-refresh",
    accessToken,
  });
  expect(requests[0]).toContain("/oauth2/v2.0/token");
  expect(requests[1]).toContain("/me?");

  const adapter = createOutlookAdapter({
    loadSecret: () => refreshToken,
    clientId,
    clientSecret,
  });
  expect(adapter.capability?.id).toBe("outlook.mail");
});
