export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.ceil(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const messageDateFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  day: 'numeric',
  month: 'long',
})

const messageClockFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

export function timestamp(value: number) {
  return messageDateFormat.format(value)
}

export function clockTime(value: number) {
  return messageClockFormat.format(value)
}
