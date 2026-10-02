import {
  connectGitHubApp,
  createGitHubAppInstallationClient,
  gitHubAppInstallUrl,
} from '#project/mcp/github'
import { createSecretBox } from '#/server/secret-box'
import type { Sqlite } from '#/server/sqlite'

type StoredConfig = {
  app_id: string
  app_slug: string
  installation_id: number
  repository: string
  base: string
  api_key_ciphertext: string
  api_key_iv: string
  api_key_tag: string
  updated_at: number
}

export type PublicGitHubConfig = {
  configured: boolean
  appId?: string
  repository?: string
  base?: string
  installUrl?: string
}

export type GitHubConfigInput = {
  appId?: unknown
  privateKey?: unknown
  repository?: unknown
  base?: unknown
}

export type ConnectGitHub = typeof connectGitHubApp

export type CurrentGitHubConfig = {
  octokit: ReturnType<typeof createGitHubAppInstallationClient>
  repository: string
  base: string
}

export type WorkspaceGitHubConfig = ReturnType<
  typeof createWorkspaceGitHubConfig
>

const { encrypt, decrypt } = createSecretBox('sweat-workspace-github')

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

export function createWorkspaceGitHubConfig(
  sqlite: Sqlite,
  options: { connect?: ConnectGitHub } = {},
) {
  const connect = options.connect ?? connectGitHubApp
  let cached: { updatedAt: number; config: CurrentGitHubConfig } | undefined

  const read = (): StoredConfig | undefined =>
    sqlite
      .prepare('SELECT * FROM workspace_github_config WHERE id = 1')
      .get() as StoredConfig | undefined

  const publicFor = (row: StoredConfig | undefined): PublicGitHubConfig =>
    row
      ? {
          configured: true,
          appId: row.app_id,
          repository: row.repository,
          base: row.base,
          installUrl: gitHubAppInstallUrl(row.app_slug),
        }
      : { configured: false }

  return {
    public: (): PublicGitHubConfig => publicFor(read()),

    async save(input: GitHubConfigInput): Promise<PublicGitHubConfig> {
      const current = read()
      const appId = text(input.appId)
      const repository = text(input.repository)
      const base = text(input.base) || 'main'
      const newKey = text(input.privateKey)
      if (!/^\d+$/.test(appId)) throw new Error('App ID must be a number')
      if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
        throw new Error('Repository must be owner/name')
      if (!newKey && !current) throw new Error('Private key is required')
      const privateKey = newKey || decrypt(current!)
      const { slug, installationId } = await connect({
        appId,
        privateKey,
        repository,
        base,
      })
      const secret = encrypt(privateKey)
      sqlite
        .prepare(
          `INSERT INTO workspace_github_config
             (id, app_id, app_slug, installation_id, repository, base,
              api_key_ciphertext, api_key_iv, api_key_tag, updated_at)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             app_id = excluded.app_id,
             app_slug = excluded.app_slug,
             installation_id = excluded.installation_id,
             repository = excluded.repository,
             base = excluded.base,
             api_key_ciphertext = excluded.api_key_ciphertext,
             api_key_iv = excluded.api_key_iv,
             api_key_tag = excluded.api_key_tag,
             updated_at = excluded.updated_at`,
        )
        .run(
          appId,
          slug,
          installationId,
          repository,
          base,
          secret.ciphertext,
          secret.iv,
          secret.tag,
          // Strictly increasing, so a same-millisecond re-save still rebuilds the client.
          Math.max(Date.now(), (current?.updated_at ?? 0) + 1),
        )
      return this.public()
    },

    clear(): PublicGitHubConfig {
      sqlite.prepare('DELETE FROM workspace_github_config WHERE id = 1').run()
      cached = undefined
      return { configured: false }
    },

    /** Live config for runs; the installation client is rebuilt only after a save. */
    current(): CurrentGitHubConfig | undefined {
      const row = read()
      if (!row) return undefined
      if (cached?.updatedAt !== row.updated_at) {
        cached = {
          updatedAt: row.updated_at,
          config: {
            octokit: createGitHubAppInstallationClient({
              appId: row.app_id,
              privateKey: decrypt(row),
              installationId: row.installation_id,
            }),
            repository: row.repository,
            base: row.base,
          },
        }
      }
      return cached.config
    },
  }
}
