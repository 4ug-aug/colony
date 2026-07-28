# Account admission

Account admission gives a fresh Sweat server a safe path from an empty database
to an invite-only multiplayer workspace using Better Auth's built-in account,
session, username, and administration support. Tauri packaging follows this
browser-delivered slice.

## Complete path

1. The server starts, applies database migrations idempotently, and ensures
   structural data such as `General` exists.
2. If no account exists, the server creates a random one-time setup token,
   stores only its hash, and prints the plaintext once.
3. A visitor presents that token and chooses an email, immutable username,
   display name, and password. The account becomes the sole workspace
   administrator and setup closes permanently.
4. Members sign in with either email or username plus password. The username is
   their primary visible name; a profile hovercard shows display name and
   email.
5. The administrator opens Workspace settings to manage Members and
   Invitations.
6. An invitation is a manually shared, single-use bearer link. Its creator
   chooses a one-, three-, or seven-day lifetime, with three days selected by
   default.
7. A valid invitation lets its first holder choose their own email, username,
   display name, and password and enter the workspace.
8. The administrator can revoke unused invitations and suspend or restore
   member accounts. Suspension revokes sessions and blocks sign-in without
   deleting shared history.
9. A signed-in member can change their password and revoke their other
   sessions. The server operator can recover the sole administrator through a
   server-side password-reset command.

## Acceptance checks

- Restarting a fresh server preserves the setup-token hash and does not emit a
  new plaintext token.
- While no account exists, an operator command rotates a lost setup token.
- Invalid, rotated, or previously redeemed setup tokens cannot create an
  administrator.
- After the first account exists, setup and open registration remain closed
  across restarts.
- Email/password and username/password sign-in identify the same account and
  establish ordinary Better Auth sessions.
- Username uniqueness follows Better Auth's normalized username behavior.
- The interface uses username as the primary author/member label and reveals
  display name and email only in profile details.
- Only the administrator can create, list, and revoke workspace invitations or
  suspend and restore members.
- Invitation creation supports only one, three, or seven days and defaults to
  three.
- Expired, revoked, and redeemed invitations cannot be reused; their states
  remain visible in Workspace settings.
- Concurrent attempts to redeem one invitation create at most one account.
- A suspended member immediately loses active sessions and cannot sign in, but
  their prior messages and run attribution remain intact.
- Private-room membership stays separate from workspace admission.

## Outside this slice

- Tauri packaging and server selection
- Multiple workspace administrators or role management
- Invitation and password-reset email
- Email verification
- Username or email changes
- Account deletion
- Portable-key identity
- Room renaming or deletion

The rationale and external sources are recorded in
[ADR 0005](./adr/0005-better-auth-accounts.md).
