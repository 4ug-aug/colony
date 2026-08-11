import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    const mediaQueryList = window.matchMedia(query)
    mediaQueryList.addEventListener('change', callback)
    return () => mediaQueryList.removeEventListener('change', callback)
  }
  const getSnapshot = () => window.matchMedia(query).matches
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
