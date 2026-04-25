import { Database } from 'bun:sqlite';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const DB_PATH = path.resolve(process.cwd(), 'db/marketing.db');
const MIGRATIONS = [
  '001_schema.sql',
  '002_integrations.sql',
  '003_content.sql',
  '004_posts_scheduled_date.sql',
  '005_posts_platform.sql',
];

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  _db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);
  const migrationsDir = path.resolve(process.cwd(), 'db/migrations');
  for (const name of MIGRATIONS) {
    const already = _db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(name);
    if (!already) {
      _db.exec(readFileSync(path.join(migrationsDir, name), 'utf-8'));
      _db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
    }
  }
  return _db;
}
