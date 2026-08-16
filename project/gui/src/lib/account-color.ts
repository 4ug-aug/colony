export const ACCOUNT_COLORS = [
  '#c2410c',
  '#b45309',
  '#047857',
  '#0f766e',
  '#0369a1',
  '#1d4ed8',
  '#6d28d9',
  '#be123c',
] as const

export function parseAccountColor(value: string): string | undefined {
  const raw = value.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(raw))
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`
}

export function accountInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
  const token = parts[0] ?? '?'
  return token.slice(0, 2).toUpperCase() || '?'
}

export function accountColor(name: string, color?: string | null): string {
  const parsed = color ? parseAccountColor(color) : undefined
  if (parsed) return parsed
  let hash = 2166136261
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ACCOUNT_COLORS[(hash >>> 0) % ACCOUNT_COLORS.length]!
}

export function accountInk(hex: string): '#fff' | '#1c1917' {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? '#1c1917' : '#fff'
}

export function accountFaceStyle(name: string, color?: string | null) {
  const backgroundColor = accountColor(name, color)
  return { backgroundColor, color: accountInk(backgroundColor) }
}
