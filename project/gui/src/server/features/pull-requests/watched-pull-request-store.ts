import type { Sqlite } from '#/server/sqlite'

export type WatchedPullRequest = {
  repository: string
  number: number
  agentDefinitionId: string
  responsibleAccountId: string
  issueId?: string
  cursor: string
  checkedSha?: string
  createdAt: number
  updatedAt: number
}

type Row = {
  repository: string
  number: number
  agent_definition_id: string
  responsible_account_id: string
  issue_id: string | null
  cursor: string
  checked_sha: string | null
  created_at: number
  updated_at: number
}

const toWatch = (row: Row): WatchedPullRequest => ({
  repository: row.repository,
  number: row.number,
  agentDefinitionId: row.agent_definition_id,
  responsibleAccountId: row.responsible_account_id,
  ...(row.issue_id ? { issueId: row.issue_id } : {}),
  cursor: row.cursor,
  ...(row.checked_sha ? { checkedSha: row.checked_sha } : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export function createWatchedPullRequestStore(sqlite: Sqlite) {
  const get = (repository: string, number: number) => {
    const row = sqlite
      .prepare(
        'SELECT * FROM watched_pull_request WHERE repository = ? AND number = ?',
      )
      .get(repository, number) as Row | null | undefined
    return row ? toWatch(row) : undefined
  }
  return {
    get,
    list: () =>
      (
        sqlite
          .prepare(
            'SELECT * FROM watched_pull_request ORDER BY created_at, repository, number',
          )
          .all() as Row[]
      ).map(toWatch),
    record(input: {
      repository: string
      number: number
      agentDefinitionId: string
      responsibleAccountId: string
      issueId?: string
      now: number
    }) {
      sqlite
        .prepare(
          `INSERT INTO watched_pull_request
             (repository, number, agent_definition_id, responsible_account_id, issue_id, cursor, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (repository, number) DO UPDATE SET
             agent_definition_id = excluded.agent_definition_id,
             responsible_account_id = excluded.responsible_account_id,
             issue_id = excluded.issue_id,
             updated_at = excluded.updated_at`,
        )
        .run(
          input.repository,
          input.number,
          input.agentDefinitionId,
          input.responsibleAccountId,
          input.issueId ?? null,
          new Date(input.now).toISOString(),
          input.now,
          input.now,
        )
    },
    remove(repository: string, number: number) {
      sqlite
        .prepare(
          'DELETE FROM watched_pull_request WHERE repository = ? AND number = ?',
        )
        .run(repository, number)
    },
    advance(
      repository: string,
      number: number,
      patch: { cursor?: string; checkedSha?: string },
      now: number,
    ) {
      sqlite
        .prepare(
          `UPDATE watched_pull_request
           SET cursor = COALESCE(?, cursor), checked_sha = COALESCE(?, checked_sha), updated_at = ?
           WHERE repository = ? AND number = ?`,
        )
        .run(patch.cursor ?? null, patch.checkedSha ?? null, now, repository, number)
    },
  }
}

export type WatchedPullRequestStore = ReturnType<typeof createWatchedPullRequestStore>
