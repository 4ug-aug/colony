# GitHub token setup

Colony talks to GitHub from the coordinator host. Put a personal access token
in `SWEAT_GITHUB_TOKEN`. Agents never receive it. The coordinator does not use
the GitHub CLI, so it will not dump a keychain password on startup.

## Create a fine-grained token

1. Open [Fine-grained personal access tokens](https://github.com/settings/personal-access-tokens).
2. Click **Generate new token**.
3. Set a name, an expiry you will rotate, and the resource owner that owns the
   repository. For an organization repository, the org must allow fine-grained
   tokens.
4. Under **Repository access**, choose **Only select repositories** and pick
   the same repo you will set as `SWEAT_GITHUB_REPOSITORY`.
5. Under **Permissions → Repository permissions**, grant:

   | Permission     | Access        | Why                                      |
   | -------------- | ------------- | ---------------------------------------- |
   | Contents       | Read and write | Checkout, commits, branches, tarball     |
   | Pull requests  | Read and write | Open and update the run pull request     |
   | Checks         | Read-only     | `github.wait_for_pull_request_checks`    |
   | Metadata       | Read-only     | Included automatically                   |

6. Generate the token and copy it. GitHub shows it once. It starts with
   `github_pat_`.

A classic token with the `repo` scope also works. Prefer fine-grained: it is
limited to one repository and does not store a password in the macOS keychain.

## Configure Colony

In `.env.local`:

```bash
SWEAT_GITHUB_REPOSITORY=owner/repository
SWEAT_GITHUB_BASE=main
SWEAT_GITHUB_TOKEN=github_pat_...
```

Or run `make setup`, enable GitHub, and paste the token when prompted.

Restart the coordinator after changing the token. `make dev` and `make server`
read `.env.local` on start. The token stays on the host; sandbox runs publish
through the GitHub MCP grant and never see it.

## Confirm it works

The coordinator starts only when both the repository and the token are set.
If the repository is set without a token, startup fails with a pointer to this
guide. After sign-in, a software-engineer run against that repository should
checkout, commit, and open a pull request without any `gh` process on the host.
