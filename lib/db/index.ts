/**
 * Central DB connection — single instance, auto-migrates on first use.
 * Import getDb() from here; never open Database() directly elsewhere.
 *
 * Runtime detection:
 *   - Bun  → bun:sqlite  (native, built-in)
 *   - Node → better-sqlite3 (used by SvelteKit SSR via Vite)
 * Both share the same synchronous API for prepare/all/get/run.
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dir          = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH        = path.resolve(__dir, '../../db/marketing.db');
const MIGRATION_PATH = path.resolve(__dir, '../../db/migrations/001_schema.sql');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DatabaseImpl: any;

if (typeof (globalThis as Record<string, unknown>).Bun !== 'undefined') {
  // Running in Bun — use native built-in
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — bun:sqlite only available in Bun runtime
  const mod = await import(/* @vite-ignore */ 'bun:sqlite');
  DatabaseImpl = mod.Database;
} else {
  // Running in Node.js (SvelteKit SSR via Vite) — use better-sqlite3
  const mod = await import('better-sqlite3');
  DatabaseImpl = mod.default;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDb(): any {
  if (_db) return _db;
  _db = new DatabaseImpl(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  _db.exec(readFileSync(MIGRATION_PATH, 'utf-8'));
  return _db;
}
