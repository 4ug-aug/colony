import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createWorkspacePreviewConfig } from './preview-config'

const createConfig = () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE workspace_preview_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    init_command TEXT,
    preview_command TEXT,
    guest_port INTEGER NOT NULL,
    grace_duration_ms INTEGER NOT NULL
  )`)
  return { sqlite, config: createWorkspacePreviewConfig(sqlite) }
}

test('missing Preview command skips Preview', () => {
  const { config } = createConfig()
  expect(config.public()).toEqual({
    configured: false,
    guestPort: 3000,
    graceDurationMs: 300000,
  })
  expect(config.preview()).toBeUndefined()
})

test('stores Preview configuration for the orchestrator', () => {
  const { config } = createConfig()
  expect(
    config.save({
      initCommand: ' npm install ',
      previewCommand: ' make dev ',
      guestPort: 3000,
      graceDurationMs: 120000,
    }),
  ).toEqual({
    configured: true,
    initCommand: 'npm install',
    previewCommand: 'make dev',
    guestPort: 3000,
    graceDurationMs: 120000,
  })
  expect(config.preview()).toEqual({
    initCommand: 'npm install',
    previewCommand: 'make dev',
    guestPort: 3000,
    graceDurationMs: 120000,
  })
})

test('empty Preview command disables Preview', () => {
  const { config } = createConfig()
  config.save({
    previewCommand: 'make dev',
    guestPort: 3000,
    graceDurationMs: 1000,
  })
  expect(
    config.save({
      previewCommand: '  ',
      guestPort: 8080,
      graceDurationMs: 0,
    }),
  ).toEqual({
    configured: false,
    guestPort: 8080,
    graceDurationMs: 0,
  })
  expect(config.preview()).toBeUndefined()
})

test('rejects an invalid guest port', () => {
  const { config } = createConfig()
  expect(() =>
    config.save({
      previewCommand: 'make dev',
      guestPort: 0,
      graceDurationMs: 1000,
    }),
  ).toThrow('Guest port and grace duration are required')
})
