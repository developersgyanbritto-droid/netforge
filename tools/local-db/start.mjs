// Development-only PostgreSQL 16 without Docker. Same credentials/port as docker-compose.yml.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.data');
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'netforge',
  password: 'netforge',
  port: 5433,
  persistent: true,
  // Force UTF-8: on Windows initdb would otherwise inherit the ANSI code page (WIN1252).
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

if (!existsSync(path.join(dir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('netforge');
} catch {
  /* already exists */
}
console.log('PostgreSQL ready on localhost:5433 (db netforge). Ctrl+C to stop.');
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
