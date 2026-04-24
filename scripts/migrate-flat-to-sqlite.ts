import { getDb } from '../src/lib/server/db/index.ts';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const CLIENTS_DIR = path.resolve(process.cwd(), 'clients');
const db = getDb();

function detectReportType(slug: string): string {
  if (slug.includes('audit')) return 'audit';
  if (slug.includes('search') || slug.includes('campaign')) return 'search';
  if (slug.includes('weekly')) return 'weekly';
  if (slug.includes('monthly') || /\d{4}-\d{2}$/.test(slug)) return 'monthly';
  if (slug.includes('alert')) return 'alert';
  return 'report';
}

function extractTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function toSqliteDate(d: Date): string {
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

const tenants = await readdir(CLIENTS_DIR);
const counts = { tenants: 0, posts: 0, reports: 0, campaigns: 0 };
let errors = 0;

// --- Tenants ---
console.log('\n[tenants]');
for (const tenant of tenants) {
  const brandPath = path.join(CLIENTS_DIR, tenant, 'brand.json');
  try {
    const brand = JSON.parse(await readFile(brandPath, 'utf-8'));
    db.prepare(`
      INSERT OR REPLACE INTO tenants
        (id, name, language, niche, location, primary_persona, tone, instructions, hashtags, google_ads_id, ads_monitoring)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tenant,
      brand.name ?? null,
      brand.language ?? 'pt_BR',
      brand.niche ?? null,
      brand.location ?? null,
      brand.primary_persona ?? null,
      brand.tone ?? null,
      brand.instructions ?? null,
      brand.hashtags ? JSON.stringify(brand.hashtags) : null,
      brand.google_ads_id ?? null,
      brand.ads_monitoring ? JSON.stringify(brand.ads_monitoring) : null,
    );
    counts.tenants++;
    console.log(`  ok  ${tenant}`);
  } catch (e) {
    console.error(`  ERR ${tenant}:`, e);
    errors++;
  }
}

// --- Posts ---
console.log('\n[posts]');
for (const tenant of tenants) {
  const postsDir = path.join(CLIENTS_DIR, tenant, 'posts');
  let files: string[];
  try {
    files = await readdir(postsDir);
  } catch {
    continue;
  }

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(postsDir, file);
    try {
      const raw = JSON.parse(await readFile(filePath, 'utf-8'));
      const result = raw.result ?? {};
      const workflow = raw.workflow ?? null;
      const mtime = (await stat(filePath)).mtime;

      db.prepare(`
        INSERT OR REPLACE INTO posts
          (id, tenant_id, status, title, content, hashtags, media_type, workflow, media_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        result.id ?? file.replace('.json', ''),
        tenant,
        result.status ?? 'draft',
        result.title ?? null,
        result.content ?? '',
        result.hashtags ? JSON.stringify(result.hashtags) : null,
        result.media_type ?? null,
        workflow ? JSON.stringify(workflow) : null,
        result.media_path ?? null,
        toSqliteDate(mtime),
      );
      counts.posts++;
      console.log(`  ok  ${tenant}/${file}`);
    } catch (e) {
      console.error(`  ERR ${tenant}/${file}:`, e);
      errors++;
    }
  }
}

// --- Reports ---
console.log('\n[reports]');
for (const tenant of tenants) {
  const reportsDir = path.join(CLIENTS_DIR, tenant, 'reports');
  let files: string[];
  try {
    files = await readdir(reportsDir);
  } catch {
    continue;
  }

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const filePath = path.join(reportsDir, file);
    try {
      const content = await readFile(filePath, 'utf-8');
      const slug = file.replace('.md', '');
      const mtime = (await stat(filePath)).mtime;

      db.prepare(`
        INSERT OR REPLACE INTO reports
          (id, tenant_id, slug, type, title, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        tenant,
        slug,
        detectReportType(slug),
        extractTitle(content),
        content,
        toSqliteDate(mtime),
      );
      counts.reports++;
      console.log(`  ok  ${tenant}/${file}`);
    } catch (e) {
      console.error(`  ERR ${tenant}/${file}:`, e);
      errors++;
    }
  }
}

// --- Campaigns ---
console.log('\n[campaigns]');
for (const tenant of tenants) {
  const campaignsDir = path.join(CLIENTS_DIR, tenant, 'ads', 'google');
  let files: string[];
  try {
    files = await readdir(campaignsDir);
  } catch {
    continue;
  }

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(campaignsDir, file);
    try {
      const raw = JSON.parse(await readFile(filePath, 'utf-8'));
      const slug = file.replace('.json', '');
      const mtime = (await stat(filePath)).mtime;

      db.prepare(`
        INSERT OR REPLACE INTO campaigns
          (id, tenant_id, slug, data, deployed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        tenant,
        slug,
        JSON.stringify(raw),
        raw.deployed_at ?? null,
        toSqliteDate(mtime),
      );
      counts.campaigns++;
      console.log(`  ok  ${tenant}/${file}`);
    } catch (e) {
      console.error(`  ERR ${tenant}/${file}:`, e);
      errors++;
    }
  }
}

console.log('\n--- summary ---');
console.log(`tenants:   ${counts.tenants}`);
console.log(`posts:     ${counts.posts}`);
console.log(`reports:   ${counts.reports}`);
console.log(`campaigns: ${counts.campaigns}`);
if (errors > 0) console.warn(`errors:    ${errors}`);
