# T01 — Move SvelteKit from `ui/` to project root

**Phase:** 0 — Foundation  
**Status:** completed  
**ADR:** ADR-001  
**Depends on:** nothing  
**Blocks:** all other tasks

---

## Goal

Move the SvelteKit app from `ui/` to the project root. This is a pure structural change — no logic, no new features. All existing functionality must work identically after.

## Why

The `ui/` subdirectory made sense when the app was a dashboard for scripts. It is now the product. The flat-file scripts are the periphery.

---

## Steps

### 1. Move files to root

```bash
# Move SvelteKit source to root
cp -r ui/src ./src
cp ui/package.json ./package.json        # merge deps — see note
cp ui/svelte.config.js ./svelte.config.js
cp ui/vite.config.ts ./vite.config.ts
cp ui/tsconfig.json ./tsconfig.json
cp ui/.npmrc ./.npmrc 2>/dev/null || true
cp ui/tailwind.config.ts ./tailwind.config.ts 2>/dev/null || true
```

**Merge `package.json`** — the root already has deps (`google-ads-api`, `marked`, etc.). Combine both, keep Bun as runtime.

### 2. Add `@` path alias

In `vite.config.ts`:
```typescript
import path from 'node:path'

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      '@': path.resolve('./src')
    }
  }
})
```

In `tsconfig.json` (inside `compilerOptions`):
```json
"paths": {
  "@/*": ["./src/*"]
}
```

SvelteKit's `$lib` alias remains unchanged (`src/lib/`).

### 3. Update `lib/db/index.ts` path

`lib/db/index.ts` references `../../db/marketing.db` and `../../db/migrations/`. After the move, `lib/db/` will be at `src/lib/server/db/`. Update the path resolution:

```typescript
const DB_PATH = path.resolve(process.cwd(), 'db/marketing.db');
```

Use `process.cwd()` (project root) instead of `__dir`-relative paths — more robust.

### 4. Update scripts

Scripts in `scripts/` import from `../lib/db/` or `./lib/ads.ts`. Update to match new paths.

### 5. Remove `ui/` directory

After verifying `bun run dev` works from root:
```bash
rm -rf ui/
```

### 6. Update `.gitignore`

Replace `ui/node_modules`, `ui/.svelte-kit` entries with `node_modules`, `.svelte-kit`.

---

## Verify

```bash
bun run dev          # UI serves on localhost:5173
bun run build        # build succeeds
bun run check        # svelte-check passes
```

All existing routes (`/`, `/[tenant]/social`, `/[tenant]/ads/google`, etc.) must render without errors.

---

## Notes

- Do NOT change any logic, queries, or file reads in this task. Structural move only.
- If `ui/package.json` and root `package.json` conflict on a dep version, prefer the newer one.
- The `lib/db/` directory currently at root moves to `src/lib/server/db/` — do this as part of this task since it's a structural move.
