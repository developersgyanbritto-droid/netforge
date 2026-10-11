import { defineConfig } from '@playwright/test';

// Expects the API (:4000) and web (:3000) to be running: `pnpm dev` from the repo root.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  outputDir: './e2e/.results',
});
