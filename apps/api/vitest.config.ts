import { defineConfig } from 'vitest/config';
import { readFileSync, existsSync } from 'node:fs';

// Load .env for integration tests (DATABASE_URL).
const env: Record<string, string> = {};
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
}

export default defineConfig({ test: { env, testTimeout: 30_000, fileParallelism: false } });
