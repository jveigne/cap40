import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Deux pages : login.html (publique) et index.html (le plan, protégé par middleware.js).
// Le code propre au plan est rangé dans /private/, que le middleware ne sert qu'aux personnes connectées.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        login: resolve(import.meta.dirname, 'login.html'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'main' ? 'private/[name]-[hash].js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
