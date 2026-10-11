import { defineConfig } from 'tsup';

// Bundle workspace packages (TypeScript sources) into the server build; keep npm deps external.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  noExternal: ['@netforge/sim-engine', '@netforge/content'],
});
