# GitHub App setup

Colony talks to GitHub from the server as a GitHub App. Agents never see its
key. An admin configures it under **Workspace settings → Integrations →
GitHub**; changes apply to the next run without a restart. Env vars are not
read.

## Create the App

1. Open **Settings → Developer settings → GitHub Apps → New GitHub App** for
   the account or organization that owns the repository.
2. Set a name and any homepage URL. Turn **Webhook → Active** off.
3. Under **Repository permissions**, grant:

   | Permission    | Access         | Why                                   |
   | ------------- | -------------- | ------------------------------------ |
   | Contents      | Read and write | Checkout, commits, branches, tarball |
   | Pull requests | Read and write | Open and update the run pull request |
   | Checks        | Read-only      | `github.get_pull_request_feedback`   |
   | Metadata      | Read-only      | Included automatically               |

4. Choose **Only on this account** and create the App. Note the **App ID**.
5. Under **Private keys**, generate a key. GitHub downloads a `.pem` file.
6. **Install App** and choose **Only select repositories** with the repository
   Colony works on.

## Configure Colony

In **Workspace settings → Integrations → GitHub**, enter the App ID and paste
the `.pem` contents. Then pick the repository and base branch: both lists are
searchable and load from GitHub with that key, showing every repository the App
is installed on. Picking a repository preselects its default branch.

Save checks the key, the installation, and the base branch. If the App is not
installed on the repository, the error links to the install page. Then give
agents **GitHub access** on the Agents page.

## What changes on GitHub

Commits and pull requests come from `<app-slug>[bot]`, and commits Colony
creates through the API show as **Verified**. If branch protection restricts
who can push, add the App to the allowed list. Pull requests opened by the App
still trigger Actions workflows.

Rotate the key by generating a new one on GitHub, pasting it, and saving.
**Clear** removes the configuration; agents with GitHub access then fail to
start until it is set again.
