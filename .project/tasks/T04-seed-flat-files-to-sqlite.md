# T04 — Write and run flat-file to SQLite seed script

**Phase:** 1 — SQLite Schema  
**Status:** pending  
**ADR:** ADR-001  
**Depends on:** T03  
**Blocks:** T09, T10, T11, T12 (UI migration tasks)

---

## Goal

Write a one-time migration script that reads all existing flat-file content from `clients/[tenant]/` and seeds the new SQLite tables. After this task, SQLite has a complete copy of all data.

**This script does NOT delete flat-files** — that happens in T13 after UI routes are verified.

---

## Script location

`scripts/migrate-flat-to-sqlite.ts`  
Remove after confirming migration success.

---

## Script outline

```typescript
import { getDb } from '@/lib/server/db/index.ts'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const CLIENTS_DIR = path.resolve(process.cwd(), 'clients')
const db = getDb()

// --- Tenants (brand.json) ---
for (const tenant of await readdir(CLIENTS_DIR)) {
  const brandPath = path.join(CLIENTS_DIR, tenant, 'brand.json')
  const brand = JSON.parse(await readFile(brandPath, 'utf-8'))
  db.prepare(`INSERT OR REPLACE INTO tenants ...`).run(/* map fields */)
}

// --- Posts (posts/*.json) ---
// Each post has shape: { result: { id, status, title, content, hashtags, media_type, ... }, workflow: {...} }
// The workflow object lives at result.workflow or top-level depending on generation version.

// --- Reports (reports/*.md) ---
// filename → slug (strip .md), detect type from slug, read content

// --- Campaigns (ads/google/*.json) ---
// filename → slug (strip .json), full JSON → data column
```

---

## Field mappings

### brand.json → tenants

| brand.json field | SQLite column |
|---|---|
| (folder name) | `id` |
| `name` | `name` |
| `language` | `language` |
| `niche` | `niche` |
| `location` | `location` |
| `primary_persona` | `primary_persona` |
| `tone` | `tone` |
| `instructions` | `instructions` |
| `hashtags` (array) | `hashtags` (JSON.stringify) |
| `google_ads_id` | `google_ads_id` |
| `ads_monitoring` (object) | `ads_monitoring` (JSON.stringify) |

### post *.json → posts

Post files have two known structures (check both):
- `result.id`, `result.status`, `result.title`, `result.content`, `result.hashtags`, `result.media_type`
- Top-level `workflow` object (strategy, clarity, impact)

| post field | SQLite column |
|---|---|
| `result.id` | `id` |
| (tenant folder) | `tenant_id` |
| `result.status` | `status` |
| `result.title` | `title` |
| `result.content` | `content` |
| `result.hashtags` | `hashtags` (JSON.stringify) |
| `result.media_type` | `media_type` |
| `workflow` object | `workflow` (JSON.stringify) |
| `result.media_path` (if exists) | `media_path` |
| file mtime | `created_at` |

### report *.md → reports

| source | SQLite column |
|---|---|
| filename without `.md` | `slug` |
| auto-generated UUID | `id` |
| tenant folder | `tenant_id` |
| detect from slug (see T03 mapping) | `type` |
| first `# Heading` line if present | `title` |
| full file content | `content` |
| file mtime | `created_at` |

### campaign *.json → campaigns

| source | SQLite column |
|---|---|
| auto-generated UUID | `id` |
| tenant folder | `tenant_id` |
| filename without `.json` | `slug` |
| full JSON.stringify of file | `data` |
| check for `deployed_at` field in JSON | `deployed_at` |

---

## Steps

1. Write `scripts/migrate-flat-to-sqlite.ts`
2. Run: `bun run scripts/migrate-flat-to-sqlite.ts`
3. Verify counts match flat-file counts:

```bash
bun run -e "
import { getDb } from './src/lib/server/db/index.ts';
const db = getDb();
console.log('tenants:', db.prepare('SELECT COUNT(*) as n FROM tenants').get());
console.log('posts:', db.prepare('SELECT COUNT(*) as n FROM posts').get());
console.log('reports:', db.prepare('SELECT COUNT(*) as n FROM reports').get());
console.log('campaigns:', db.prepare('SELECT COUNT(*) as n FROM campaigns').get());
"
```

4. Spot-check: open a known post/report/tenant in SQLite and compare to the source file
5. Keep the script for re-runs (in case the migration needs to be redone during development) — delete after T13 completes

---

## Error handling

Use `INSERT OR REPLACE` (not `INSERT OR IGNORE`) so re-runs are idempotent. Log any file that fails to parse with its path — do not abort the whole migration on a single bad file.
