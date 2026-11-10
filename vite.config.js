import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build`       → app normal (Vercel / Netlify / cualquier hosting estático)
// `npm run build:demo`  → un único index.html autocontenido en modo demo (sin red)
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'demo' ? [viteSingleFile()] : [])],
  define: {
    __FORCE_DEMO__: JSON.stringify(mode === 'demo'),
  },
  build: {
    outDir: mode === 'demo' ? 'dist-demo' : 'dist',
    chunkSizeWarningLimit: 4000,
  },
}))
