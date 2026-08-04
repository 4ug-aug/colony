import { defineConfig } from 'vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  // Prevent Vite from clearing the screen so Tauri CLI output stays visible.
  clearScreen: false,
  // Tauri attaches to a fixed dev port; fail fast if it's taken.
  server: { strictPort: true },
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), viteReact()],
  build: {
    // Vite's default target assumes a current browser. Windows ships whatever
    // WebView2 the machine happens to have, and syntax it cannot parse kills
    // the whole bundle before a single statement runs — so pin a conservative
    // floor per platform rather than inheriting the default.
    target:
      process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Debug bundles are built to be read in the inspector.
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})

export default config
