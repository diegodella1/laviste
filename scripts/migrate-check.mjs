#!/usr/bin/env node
/**
 * Post-migration integrity check (PRAGMA user_version 15, Automático AU1).
 *
 * Backup BEFORE deploying this schema (copy the snapshot off the Pi):
 *   docker compose exec -T app node scripts/backup.mjs
 *   # then scp the newest file in backups/ off the host volume
 *
 * After app start (migration runs inside BEGIN IMMEDIATE):
 *   DATA_DIR=/app/data node scripts/migrate-check.mjs
 *
 * Rollback: restore that snapshot and redeploy the previous image, or revert
 * this code onto the migrated DB (additive schema; see docs/MIGRATION-AU1.md).
 * The v14 image starts on a v15 database (ignores auto_* and simulated).
 *
 * Never prints password hashes, vault secrets, or APP_PASSWORD.
 */
import {DatabaseSync} from 'node:sqlite';
import {resolve, join} from 'node:path';
import {inspectMigration, SCHEMA_USER_VERSION} from '../lib/migrations/multiuser.mjs';

const HELP = `Usage: node scripts/migrate-check.mjs [path/to/tesis.sqlite]

Checks PRAGMA user_version=${SCHEMA_USER_VERSION}, owner backfill, user_id IS NULL = 0,
ops checksum, integrity_check and foreign_key_check.

Backup before migrate:
  docker compose exec -T app node scripts/backup.mjs
  Copy backups/laviste-*.sqlite off the volume (the backup service only keeps 7 locally).

Environment: DATA_DIR (default ./data). Does not print secrets.
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(HELP);
  process.exit(0);
}

const dbPath = process.argv.find(arg => arg.endsWith('.sqlite'))
  || join(resolve(process.env.DATA_DIR || 'data'), 'tesis.sqlite');

const db = new DatabaseSync(dbPath, {readOnly: true});
try {
  const report = inspectMigration(db);
  const {ok, errors, ...rest} = report;
  process.stdout.write(JSON.stringify({ok, db: dbPath, ...rest, errors}, null, 2) + '\n');
  process.exit(ok ? 0 : 1);
} finally {
  db.close();
}
