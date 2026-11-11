import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build`       → regular app (Vercel / Netlify / any static host)
// `npm run build:demo`  → a single self-contained index.html in demo mode (offline)
export default defineConfig(({ mode }) => ({
  // Relative paths: works at a domain root and in subfolders (GitHub Pages: /bellota/)
  base: './',
  plugins: [react(), ...(mode === 'demo' ? [viteSingleFile()] : [])],
  define: {
    __FORCE_DEMO__: JSON.stringify(mode === 'demo'),
  },
  build: {
    outDir: mode === 'demo' ? 'dist-demo' : 'dist',
    chunkSizeWarningLimit: 4000,
  },
}))
