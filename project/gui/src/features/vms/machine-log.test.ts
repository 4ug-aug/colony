import { expect, test } from 'bun:test'
import { filterMachineLog, parseMachineLog } from './machine-log'

test('blank console text has no lines', () => {
  expect(parseMachineLog('')).toEqual([])
  expect(parseMachineLog('  \n\n  ')).toEqual([])
})

test('plain stdout becomes one line per newline', () => {
  expect(
    parseMachineLog('$ vite dev --port 3010\nvite: command not found\n'),
  ).toEqual([
    { raw: '$ vite dev --port 3010', message: '$ vite dev --port 3010' },
    { raw: 'vite: command not found', message: 'vite: command not found' },
  ])
})

test('concatenated Docker records split even without newlines', () => {
  const text =
    'time="2026-08-18T05:11:39.101011127Z" level=info msg="Starting up" time="2026-08-18T05:11:39.101232585Z" level=info msg="containerd not running, starting managed containerd"'
  expect(parseMachineLog(text)).toEqual([
    {
      raw: 'time="2026-08-18T05:11:39.101011127Z" level=info msg="Starting up"',
      time: '2026-08-18T05:11:39.101011127Z',
      level: 'info',
      message: 'Starting up',
    },
    {
      raw: 'time="2026-08-18T05:11:39.101232585Z" level=info msg="containerd not running, starting managed containerd"',
      time: '2026-08-18T05:11:39.101232585Z',
      level: 'info',
      message: 'containerd not running, starting managed containerd',
    },
  ])
})

test('newline-separated Docker records keep extra fields off the message', () => {
  expect(
    parseMachineLog(
      'time="2026-08-18T05:05:36Z" level=warning msg="API listen on /var/run/docker.sock" module=debug\n',
    ),
  ).toEqual([
    {
      raw: 'time="2026-08-18T05:05:36Z" level=warning msg="API listen on /var/run/docker.sock" module=debug',
      time: '2026-08-18T05:05:36Z',
      level: 'warning',
      message: 'API listen on /var/run/docker.sock',
    },
  ])
})

test('search matches time, level, or message without regard to case', () => {
  const lines = parseMachineLog(
    'time="2026-08-18T05:11:39Z" level=error msg="vite: command not found"\ntime="2026-08-18T05:11:40Z" level=info msg="Starting up"\n',
  )
  expect(filterMachineLog(lines, '')).toEqual(lines)
  expect(filterMachineLog(lines, 'VITE')).toEqual([lines[0]])
  expect(filterMachineLog(lines, 'error')).toEqual([lines[0]])
  expect(filterMachineLog(lines, '05:11:40')).toEqual([lines[1]])
})
