export type MachineLogLine = {
  raw: string
  time?: string
  level?: string
  message: string
}

const quotedMessage = /\bmsg="((?:\\.|[^"\\])*)"/
const logTime = /\btime="([^"]+)"/
const logLevel = /\blevel=(\S+)/

function unescapeMessage(value: string) {
  return value.replace(/\\([\\"])/g, '$1')
}

function parseRecord(raw: string): MachineLogLine {
  const time = raw.match(logTime)?.[1]
  const level = raw.match(logLevel)?.[1]
  const quoted = raw.match(quotedMessage)?.[1]
  if (!time && !level && quoted === undefined) return { raw, message: raw }
  return {
    raw,
    ...(time ? { time } : {}),
    ...(level ? { level } : {}),
    message: quoted !== undefined ? unescapeMessage(quoted) : raw,
  }
}

export function parseMachineLog(text: string): MachineLogLine[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) =>
      line.includes('time="') ? line.split(/(?=time=")/) : [line],
    )
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseRecord)
}

export function filterMachineLog(
  lines: MachineLogLine[],
  query: string,
): MachineLogLine[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return lines
  return lines.filter((line) =>
    [line.time, line.level, line.message].some((part) =>
      part?.toLowerCase().includes(needle),
    ),
  )
}

export function formatLogTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}
