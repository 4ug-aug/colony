import { migratedDatabase } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { createWorkspaceConnections } from './workspace-connections'


const withSecret = <T>(run: () => T): T => {
  const previous = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = 'test-secret'
  try {
    return run()
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = previous
  }
}

const createStore = () => {
  const sqlite = migratedDatabase()
  return { sqlite, store: createWorkspaceConnections(sqlite) }
}

test('lists registry kinds as not configured by default', () => {
  withSecret(() => {
    const { store } = createStore()
    const listed = store.list()
    expect(listed.map((item) => item.id)).toEqual([
      'asana',
      'outline',
      'grafana',
    ])
    expect(listed.every((item) => !item.configured)).toBe(true)
  })
})

test('saves encrypted secrets, keeps blank key, and never returns plaintext', () => {
  withSecret(() => {
    const { sqlite, store } = createStore()
    const saved = store.save({
      kind: 'asana',
      fields: { projectGid: '123' },
      apiKey: 'secret-token',
    })
    expect(saved).toMatchObject({
      configured: true,
      values: { projectGid: '123' },
      linkedAgentIds: [],
    })
    expect(saved).not.toHaveProperty('apiKey')
    expect(
      sqlite.query('SELECT api_key_ciphertext FROM workspace_connection').get(),
    ).not.toEqual({ api_key_ciphertext: 'secret-token' })

    store.save({ kind: 'asana', fields: { projectGid: '456' } })
    expect(store.list().find((item) => item.id === 'asana')).toMatchObject({
      values: { projectGid: '456' },
      configured: true,
    })
    expect(store.adaptersForAgent('antboy')).toEqual([])
  })
})

test('rejects linking while not configured and clears links with credentials', () => {
  withSecret(() => {
    const { store } = createStore()
    expect(() => store.setLinks('outline', ['antboy'])).toThrow(
      /must be configured/,
    )

    store.save({
      kind: 'outline',
      fields: { url: 'https://wiki.example.com' },
      apiKey: 'outline-key',
    })
    expect(store.setLinks('outline', ['antboy', 'software-engineer'])).toEqual([
      'antboy',
      'software-engineer',
    ])
    expect(store.adaptersForAgent('antboy')).toHaveLength(1)
    expect(store.adaptersForAgent('antboy')[0]?.capability?.id).toBe(
      'outline.documents',
    )
    expect(store.adaptersForAgent('software-engineer')).toHaveLength(1)

    const cleared = store.clear('outline')
    expect(cleared.configured).toBe(false)
    expect(cleared.linkedAgentIds).toEqual([])
    expect(store.adaptersForAgent('antboy')).toEqual([])
  })
})
