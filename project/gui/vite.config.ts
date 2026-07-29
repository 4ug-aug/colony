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
})

export default config
