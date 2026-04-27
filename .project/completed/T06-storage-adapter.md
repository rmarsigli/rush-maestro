# T06 — Storage adapter interface + local implementation

**Phase:** 2 — Data Layer  
**Status:** pending  
**ADR:** ADR-001  
**Depends on:** T01  
**Blocks:** T07 (UI routes that serve images), T10 (MCP media tools)

---

## Goal

Define a `StorageAdapter` interface and implement it for local filesystem. All image I/O in routes and MCP tools goes through this interface — no `fs` calls for images in routes.

This unblocks the future R2/S3 migration: swap one file, zero other changes.

---

## File: `src/lib/server/storage.ts`

```typescript
import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

export interface StorageAdapter {
  put(tenant: string, filename: string, data: Buffer, mime: string): Promise<void>
  url(tenant: string, filename: string): string
  delete(tenant: string, filename: string): Promise<void>
  exists(tenant: string, filename: string): boolean
}

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage/images')

export const local: StorageAdapter = {
  async put(tenant, filename, data) {
    const dir = path.join(STORAGE_ROOT, tenant)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, filename), data)
  },
  url(tenant, filename) {
    return `/api/media/${tenant}/${encodeURIComponent(filename)}`
  },
  delete(tenant, filename) {
    return unlink(path.join(STORAGE_ROOT, tenant, filename))
  },
  exists(tenant, filename) {
    return existsSync(path.join(STORAGE_ROOT, tenant, filename))
  }
}

// Active adapter — swap this line to switch to R2
export const storage: StorageAdapter = local
```

---

## Update media API route

The existing `src/routes/api/media/[client_id]/[filename]/+server.ts` currently reads from `clients/[tenant]/`. Update it to read from `storage/images/[tenant]/`:

```typescript
// src/routes/api/media/[client_id]/[filename]/+server.ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export async function GET({ params }) {
  const filepath = path.resolve(
    process.cwd(),
    'storage/images',
    params.client_id,
    params.filename
  )
  const data = await readFile(filepath)
  // ... return with correct Content-Type
}
```

Or even cleaner: the route calls `storage.url()` and redirects, so the local adapter handles it directly.

---

## Migrate existing images

After implementing the adapter, move images from `clients/[tenant]/media/` or wherever they currently live to `storage/images/[tenant]/`:

```bash
# for each tenant
cp -r clients/portico/media/* storage/images/portico/ 2>/dev/null || true
cp -r clients/bracar-pneus/media/* storage/images/bracar-pneus/ 2>/dev/null || true
```

Update `.gitignore` to include `storage/images/` (already sensitive data, same as `clients/`).

---

## Future R2 implementation (not in scope now)

When ready, create `src/lib/server/storage-r2.ts`:
```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
export const r2: StorageAdapter = { ... }
```

Then in `storage.ts`:
```typescript
import { r2 } from './storage-r2.ts'
export const storage: StorageAdapter = process.env.R2_BUCKET ? r2 : local
```

Zero changes elsewhere.

---

## Verify

```bash
# Confirm existing images still serve after route update
curl -I http://localhost:5173/api/media/portico/some-image.jpg
# → 200 OK
```
