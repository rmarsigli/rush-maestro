# T02 — Drop dual-runtime DB shim, use `bun:sqlite` directly

**Phase:** 0 — Foundation  
**Status:** completed  
**ADR:** ADR-001  
**Depends on:** T01 (SvelteKit at root)  
**Blocks:** T04

---

## Goal

Remove the Bun/Node runtime detection from `src/lib/server/db/index.ts` and use `bun:sqlite` directly. Remove `better-sqlite3` dependency.

## Why

The shim exists because the SvelteKit dev server previously ran under Vite/Node. After T01, the project runs entirely under Bun. The dual-runtime code is dead weight and introduces async `await import()` on every DB initialization.

---

## Current code (to replace)

```typescript
// Current: detects runtime, async dynamic import
if (typeof globalThis.Bun !== 'undefined') {
  const mod = await import('bun:sqlite');
  DatabaseImpl = mod.Database;
} else {
  const mod = await import('better-sqlite3');
  DatabaseImpl = mod.default;
}
```

## Target code

```typescript
import { Database } from 'bun:sqlite';

export function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  runMigrations(_db);
  return _db;
}
```

---

## Steps

1. Replace `src/lib/server/db/index.ts` — static import, synchronous, no runtime detection
2. Remove `// @ts-ignore` comments and `eslint-disable-next-line` directives related to the shim
3. Remove type annotations using `any` for `DatabaseImpl` and `_db` — use `Database` from `bun:sqlite`
4. Remove `better-sqlite3` from `package.json` (both `dependencies` and `devDependencies`)
5. Run `bun install` to clean lockfile
6. Verify `bun run dev` still works

---

## DB path strategy

Use `process.cwd()` instead of `__dirname`-relative paths so the DB location is always resolved from the project root regardless of where the module lives:

```typescript
const DB_PATH = path.resolve(process.cwd(), 'db/marketing.db');
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db/migrations');
```

---

## Verify

```bash
bun run dev
# navigate to /settings/integrations — confirms DB reads work
bun run scripts/test-ads-connection.ts  # confirms scripts still work
```
