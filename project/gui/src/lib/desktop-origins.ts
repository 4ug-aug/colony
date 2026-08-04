// Tauri serves the desktop app from a platform-specific origin, and the choice
// is not ours to make: macOS and Linux get the custom `tauri://` scheme, while
// Windows uses `http://tauri.localhost` (or `https://` when `useHttpsScheme` is
// enabled). Anything that gates requests on Origin has to accept all three, or
// the desktop app works on one platform and gets 403s on another.
export const DESKTOP_ORIGINS = [
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
]

// Narrows, so callers can return the origin straight back as the allowed one.
export const isDesktopOrigin = (origin: string | null): origin is string =>
  origin !== null && DESKTOP_ORIGINS.includes(origin)
