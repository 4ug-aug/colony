import { useRef, useSyncExternalStore } from 'react'

/** Subscribe to window keydown without useEffect. */
export function useWindowKeydown(handler: (event: KeyboardEvent) => void) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useSyncExternalStore(
    () => {
      const listener = (event: KeyboardEvent) => handlerRef.current(event)
      window.addEventListener('keydown', listener)
      return () => window.removeEventListener('keydown', listener)
    },
    () => 0,
    () => 0,
  )
}
