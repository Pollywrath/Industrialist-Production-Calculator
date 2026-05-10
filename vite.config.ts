import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@xyflow')) {
              return 'react-flow';
            }
            if (id.includes('lucide-react')) {
              return 'lucide';
            }
            if (
              id.includes('react-dom') ||
              id.includes('react/') ||
              id.includes('scheduler')
            ) {
              return 'react-vendor';
            }
            return 'vendor';
          }
          if (
            id.includes('src/data/') ||
            id.includes('src\\data\\') ||
            id.endsWith('.json')
          ) {
            return 'database';
          }
        },
      },
    },
  },
});
