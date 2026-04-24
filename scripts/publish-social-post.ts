/**
 * Publishes an approved social media post to Instagram (and optionally Facebook)
 * via the Meta Graph API using the Instagram Container API flow.
 *
 * Usage: bun scripts/publish-social-post.ts <tenant_id> <post_id>
 * Example: bun scripts/publish-social-post.ts portico 2026-04-24_revestimentos-monoliticos
 *
 * Required in .env:
 *   META_PAGE_ACCESS_TOKEN
 *   META_PAGE_ID
 *   META_INSTAGRAM_ACCOUNT_ID
 *   MEDIA_PUBLIC_BASE_URL  (e.g. https://xyz.ngrok.io/api/media)
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { getPost, updatePostStatus } from '../src/lib/server/posts.ts';

const GRAPH_API_VERSION = 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const STORAGE_ROOT = path.resolve(import.meta.dir, '../storage/images');

async function graphApi(endpoint: string, method: 'GET' | 'POST', body?: Record<string, string>): Promise<unknown> {
    const url = `${GRAPH_BASE}${endpoint}`;
    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json() as Record<string, unknown>;
    if (!res.ok || json.error) {
        throw new Error(`Graph API error: ${JSON.stringify(json.error || json)}`);
    }
    return json;
}

async function waitForContainer(igAccountId: string, containerId: string, token: string, maxWaitMs = 30_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const result = await graphApi(`/${containerId}?fields=status_code&access_token=${token}`, 'GET') as Record<string, unknown>;
        if (result.status_code === 'FINISHED') return;
        if (result.status_code === 'ERROR') throw new Error('Container processing failed with ERROR status.');
        await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error('Timed out waiting for container to finish processing.');
}

async function main() {
    const [tenantId, postId] = process.argv.slice(2);

    if (!tenantId || !postId) {
        console.error('Usage: bun scripts/publish-social-post.ts <tenant_id> <post_id>');
        process.exit(1);
    }

    const token = process.env.META_PAGE_ACCESS_TOKEN;
    const pageId = process.env.META_PAGE_ID;
    const igAccountId = process.env.META_INSTAGRAM_ACCOUNT_ID;

    if (!token || !pageId || !igAccountId) {
        console.error('Missing Meta credentials. Add META_PAGE_ACCESS_TOKEN, META_PAGE_ID, and META_INSTAGRAM_ACCOUNT_ID to .env');
        process.exit(1);
    }

    const post = getPost(postId);
    if (!post) {
        console.error(`Post "${postId}" not found in database.`);
        process.exit(1);
    }

    if (post.status !== 'approved') {
        console.error(`Post status is "${post.status}". Only approved posts can be published.`);
        process.exit(1);
    }

    // Find media file in storage/images/<tenant>/
    const tenantImagesDir = path.join(STORAGE_ROOT, tenantId);
    let mediaFile: string | undefined;
    try {
        const allFiles = await fs.readdir(tenantImagesDir);
        mediaFile = allFiles.find(f => f.startsWith(postId + '.') || f.startsWith(postId + '-'));
    } catch { /* no images directory */ }

    if (!mediaFile) {
        console.error(`No media file found for post "${postId}" in storage/images/${tenantId}/. Attach an image or video before publishing.`);
        process.exit(1);
    }

    const caption = `${post.content}\n\n${post.hashtags.join(' ')}`.trim();
    console.log(`\nPublishing "${post.title ?? postId}" to Instagram...`);
    console.log(`Media: ${mediaFile} | Type: ${post.media_type}`);

    // Instagram requires media to be accessible via a public URL.
    // Run with a tunnel (ngrok, Cloudflare Tunnel, etc.) and set MEDIA_PUBLIC_BASE_URL.
    const publicBaseUrl = process.env.MEDIA_PUBLIC_BASE_URL;
    if (!publicBaseUrl) {
        console.error('MEDIA_PUBLIC_BASE_URL not set. Instagram requires a public URL to access the media file.');
        console.error('Set it to your tunnel URL, e.g.: MEDIA_PUBLIC_BASE_URL=https://xyz.ngrok.io/api/media');
        process.exit(1);
    }

    const mediaUrl = `${publicBaseUrl}/${tenantId}/${mediaFile}`;
    const isVideo = /\.(mp4|webm|mov)$/i.test(mediaFile);

    console.log(`\n[1/3] Creating media container...`);
    const containerPayload: Record<string, string> = { caption, access_token: token };
    if (isVideo) {
        containerPayload.media_type = 'REELS';
        containerPayload.video_url = mediaUrl;
        containerPayload.share_to_feed = 'true';
    } else {
        containerPayload.image_url = mediaUrl;
    }

    const container = await graphApi(`/${igAccountId}/media`, 'POST', containerPayload) as { id: string };
    const containerId = container.id;
    console.log(`    Container created: ${containerId}`);

    console.log(`[2/3] Waiting for container to finish processing...`);
    await waitForContainer(igAccountId, containerId, token);
    console.log(`    Container ready.`);

    console.log(`[3/3] Publishing...`);
    const published = await graphApi(`/${igAccountId}/media_publish`, 'POST', {
        creation_id: containerId,
        access_token: token,
    }) as { id: string };
    console.log(`    Published! Media ID: ${published.id}`);

    updatePostStatus(postId, 'published', new Date().toISOString());
    console.log(`\nDone. Post status updated to "published".`);
}

main().catch(err => {
    console.error('\nPublish failed:', (err as Error).message || err);
    process.exit(1);
});
