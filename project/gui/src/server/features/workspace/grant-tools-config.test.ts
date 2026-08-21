import { migratedDatabase } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { createWorkspaceGrantToolsConfig } from './grant-tools-config'

const createConfig = () => {
  const sqlite = migratedDatabase()
  return { sqlite, config: createWorkspaceGrantToolsConfig(sqlite) }
}

test('defaults to granting every eligible tool', () => {
  const { config } = createConfig()
  expect(config.public()).toEqual({
    mode: 'all',
    tools: [],
    bundles: {},
    defaultBundles: [],
  })
  expect(config.policy()).toEqual({ mode: 'all' })
})

test('stores allowlist, bundles, and model fallback', () => {
  const { config } = createConfig()
  expect(
    config.save({
      mode: 'model',
      tools: 'workspace.get_issue\ngithub.compare',
      bundles: 'issues: workspace.list_issues, workspace.get_issue',
      defaultBundles: 'issues',
    }),
  ).toEqual({
    mode: 'model',
    tools: ['workspace.get_issue', 'github.compare'],
    bundles: {
      issues: ['workspace.list_issues', 'workspace.get_issue'],
    },
    defaultBundles: ['issues'],
  })
  expect(config.policy()).toEqual({
    mode: 'model',
    tools: ['workspace.get_issue', 'github.compare'],
    bundles: {
      issues: ['workspace.list_issues', 'workspace.get_issue'],
    },
    defaultBundles: ['issues'],
  })
})

test('rejects an unknown mode', () => {
  const { config } = createConfig()
  expect(() => config.save({ mode: 'magic' })).toThrow(
    'Mode must be all, allowlist, bundles, or model',
  )
})
