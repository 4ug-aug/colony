---
status: accepted
---

# Package the client as a Tauri desktop app

Sweat's intended primary daily experience is a native Tauri desktop
application, with the browser client kept as a universally accessible
alternative. The desktop app wraps the **same** React client and calls the
**same** self-hosted coordinator API over HTTP and WebSocket. Tauri is a
packaging and native-affordance layer; it does not contain a second
orchestration implementation. This first slice delivers packaging plus
first-launch server selection and targets macOS. Native notifications, tray
status, and deep links are deferred.

## Server selection

A browser tab already knows its server from its own origin. A desktop app is
served from the opaque `tauri://localhost` origin, so it cannot derive a server
address from `window.location`. On first launch the app therefore asks the user
for the Sweat server URL, validates reachability against the existing
`GET /api/admission/status` endpoint, and persists the choice. The browser
client keeps its existing behavior: the server base still resolves from
`VITE_SWEAT_API_URL` or the current origin, with no selection screen.

## Cross-origin authentication over plain HTTP

The desktop app runs at `tauri://localhost` and talks to a self-hosted server
that is commonly reached over plain HTTP (localhost or a LAN address). The
webview's own `fetch`/`WebSocket` cannot carry the session cookie in that
cross-site, non-HTTPS setting, so the app routes its HTTP through Tauri's native
Rust HTTP plugin instead. That plugin keeps a persistent cookie jar that is not
bound by the webview's `SameSite`/`Secure` rules, so ordinary Better Auth cookie
sessions authenticate every HTTP request — no bearer token or HTTPS required.

The WebSocket is the one transport the cookie jar cannot reach: the Tauri
WebSocket plugin opens a separate connection with no access to the HTTP jar. It
is authenticated with a short-lived **realtime ticket** instead:

- The coordinator exposes `GET /api/realtime-ticket`, which returns a 30-second
  HMAC-signed ticket (bound to the user id) for the already-authenticated HTTP
  request.
- Before opening the stream, the desktop client fetches a ticket over the
  working HTTP path and passes it in the WebSocket URL (`?ticket=…`). The
  coordinator's stream upgrade accepts a valid ticket, falling back to session
  authentication for the browser (which reaches the same-site cookie natively).

The coordinator also accepts `tauri://localhost` as a permitted CORS origin,
which the WebSocket upgrade sends explicitly (the Rust client omits `Origin`
otherwise, and the coordinator gates every request on an allowed origin before
authenticating). The browser client is untouched: it authenticates with cookies
and `credentials: 'include'` and streams over a native same-site WebSocket.

## Boundaries preserved

The static client/server split, server-owned runs, and the
agent-definition / run / sandbox boundaries are unchanged. No server logic moves
into the desktop shell.

## Sources

- [Tauri v2 configuration](https://v2.tauri.app/reference/config/) documents the
  `build`, window, and bundle settings used to wrap the Vite client.
- [Tauri HTTP plugin](https://v2.tauri.app/plugin/http-client/) provides a
  Rust-backed fetch that bypasses the webview cookie policy.
- [Tauri WebSocket plugin](https://v2.tauri.app/plugin/websocket/) opens the
  room stream from Rust with custom headers.
