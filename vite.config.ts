import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

// https://vite.dev/config/
const iconVersion =
  process.env.CF_PAGES_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  process.env.npm_package_version ??
  'dev';

export default defineConfig({
  define: {
    'import.meta.env.VITE_ICON_VERSION': JSON.stringify(iconVersion),
  },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  worker: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash][extname]',
      },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash][extname]',
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
