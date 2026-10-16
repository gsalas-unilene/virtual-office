import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Root page shows the floor 4 model; the legacy walkthrough stays available as its own page.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        walkthrough: resolve(import.meta.dirname, 'walkthrough.html'),
      },
    },
  },
});
