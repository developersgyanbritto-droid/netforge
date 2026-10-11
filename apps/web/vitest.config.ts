import { defineConfig } from 'vitest/config';

// Browser tests live in e2e/ and run with Playwright (`pnpm e2e`), not Vitest.
export default defineConfig({ test: { exclude: ['e2e/**', 'node_modules/**', '.next/**'], passWithNoTests: true } });
