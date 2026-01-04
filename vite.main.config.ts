import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

// Plugin to copy migration files
function copyMigrations() {
  return {
    name: 'copy-migrations',
    writeBundle() {
      const srcDir = path.resolve(__dirname, 'src/db/migrations');
      const destDir = path.resolve(__dirname, '.vite/build/db/migrations');
      
      // Create destination directory
      fs.mkdirSync(destDir, { recursive: true });
      
      // Copy all .sql files
      const files = fs.readdirSync(srcDir);
      for (const file of files) {
        if (file.endsWith('.sql')) {
          fs.copyFileSync(
            path.join(srcDir, file),
            path.join(destDir, file)
          );
        }
      }
      console.log('Copied migration files to build directory');
    },
  };
}

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['better-sqlite3', '@napi-rs/canvas'],
    },
  },
  plugins: [copyMigrations()],
});
