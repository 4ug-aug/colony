// Tauri picks the webview's origin per platform: macOS and Linux get the custom
// `tauri://` scheme, Windows gets `http://tauri.localhost` (or `https://` with
// `useHttpsScheme`). Anything gating on Origin has to accept all three, or the
// app works on one platform and 403s on another.
export const DESKTOP_ORIGINS = [
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
]

// Narrows, so callers can return the origin straight back as the allowed one.
export const isDesktopOrigin = (origin: string | null): origin is string =>
  origin !== null && DESKTOP_ORIGINS.includes(origin)
