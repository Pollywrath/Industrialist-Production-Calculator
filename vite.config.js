import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Industrialist-Production-Calculator/',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  worker: {
    format: 'es'
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@xyflow')) return 'vendor-xyflow';
          if (id.includes('node_modules/elkjs')) return 'vendor-elk';
          if (id.includes('node_modules/react')) return 'vendor-react';
          if (id.includes('/src/solvers/')) return 'solvers';
          if (id.includes('/src/data/')) return 'game-data';
        }
      }
    }
  }
})