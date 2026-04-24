import { Database } from 'bun:sqlite';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const DB_PATH = path.resolve(process.cwd(), 'db/marketing.db');
const MIGRATIONS = [
  path.resolve(process.cwd(), 'db/migrations/001_schema.sql'),
  path.resolve(process.cwd(), 'db/migrations/002_integrations.sql'),
];

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    _db.exec(readFileSync(migration, 'utf-8'));
  }
  return _db;
}
