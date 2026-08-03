import { useCallback, useState } from 'react'

/** Boolean UI state that survives reloads, mirrored into localStorage. */
export function useStoredBoolean(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => {
    const saved = localStorage.getItem(key)
    return saved === null ? fallback : saved === 'true'
  })

  const store = useCallback(
    (next: boolean) => {
      setValue(next)
      localStorage.setItem(key, String(next))
    },
    [key],
  )

  return [value, store] as const
}
