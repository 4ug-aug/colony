---
status: accepted
---

# Keep accounts within Better Auth

Each Sweat server owns its accounts and sessions using Better Auth's built-in
email-and-password authentication. Better Auth's username plugin adds a
workspace-unique username that can also be used to sign in. The username is the
account's primary visible name in the workspace; display name and email are
secondary details shown in profile UI. Accounts remain server-local rather
than portable across Sweat servers. Usernames are immutable in the initial
Account admission slice.

Production registration is closed: an operator bootstraps the first account,
and later accounts require workspace admission. Local development may seed
reusable accounts.

On a fresh production server, startup emits a random one-time setup token. The
first visitor must present it before choosing the first account's email,
username, display name, and password. That account becomes the first workspace
administrator and the setup flow closes permanently. The server stores only
the token hash, persists it across restarts without automatic expiry, and
prints plaintext only when creating or rotating it. While no account exists,
the operator may rotate a lost token through a server-side command. This
preserves a first-visit setup experience without allowing an arbitrary network
visitor to claim the workspace.

Later accounts require single-use workspace invitation links created by an
administrator and shared manually. The invited person chooses their own
credentials. The administrator selects a one-, three-, or seven-day lifetime,
with three days as the default, and may revoke an unused invitation. Redeemed,
expired, and revoked invitation states remain visible; invitation email
delivery is outside the initial slice.

An invitation is an unbound bearer credential: whoever possesses it may redeem
it first. Sweat does not claim email binding without email verification.

The first account is the sole workspace administrator in this slice.
Administrator promotion, demotion, and role management are deferred.

Administrator password recovery is a server-side operator command that sets a
new password and revokes existing sessions. Automated reset email and
permanent recovery links are deferred.

Signed-in members can change their own password through Better Auth and revoke
their other sessions. Email changes are deferred.

Better Auth's admin plugin supplies account suspension and restoration.
Suspension revokes sessions and blocks sign-in while preserving authored
messages, run attribution, and shared history; account deletion is deferred.
Workspace-wide Members and Invitations are managed under Workspace settings,
separate from private-room membership.

A custom portable-key plugin was rejected because Sweat would have to own the
security-critical challenge, replay, signature, key-storage, recovery, and
browser-signer behavior that using Better Auth was meant to avoid. Better
Auth's custom plugin system could still issue its sessions after key
verification, but that would retain the session machinery while moving the
hardest authentication risks into Sweat.

## Sources

- [Better Auth email and password](https://www.better-auth.com/docs/authentication/email-password)
  documents the built-in authenticator used by Sweat.
- [Better Auth username plugin](https://better-auth.com/docs/plugins/username)
  adds normalized usernames and username/password sign-in on top of the
  email-and-password authenticator.
- [Better Auth plugin architecture](https://better-auth.com/docs/concepts/plugins)
  shows that custom authentication is possible, including custom endpoints and
  session creation, and makes the additional ownership boundary explicit.
- [Better Auth admin plugin](https://www.better-auth.com/docs/plugins/admin)
  provides roles, bans, and session revocation used for workspace
  administration and account suspension.
