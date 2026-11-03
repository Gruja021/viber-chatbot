import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    migrate: 'scripts/migrate.ts',
  },
  format: ['cjs'],
  dts: true,
  outDir: 'dist',
});
