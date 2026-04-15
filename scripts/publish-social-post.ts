/**
 * Publishes an approved social media post to Instagram (and optionally Facebook)
 * via the Meta Graph API using the Instagram Container API flow.
 *
 * Usage: bun scripts/publish-social-post.ts <client_id> <post_filename>
 * Example: bun scripts/publish-social-post.ts portico 2025-04-15_lancamento.json
 *
 * Required in .env:
 *   META_PAGE_ACCESS_TOKEN
 *   META_PAGE_ID
 *   META_INSTAGRAM_ACCOUNT_ID
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const GRAPH_API_VERSION = 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface Post {
    id: string;
    status: string;
    title: string;
    content: string;
    hashtags: string[];
    media_type: string;
}

async function graphApi(endpoint: string, method: 'GET' | 'POST', body?: Record<string, string>): Promise<any> {
    const url = `${GRAPH_BASE}${endpoint}`;
    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok || json.error) {
        throw new Error(`Graph API error: ${JSON.stringify(json.error || json)}`);
    }
    return json;
}

async function waitForContainer(igAccountId: string, containerId: string, token: string, maxWaitMs = 30_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const result = await graphApi(`/${containerId}?fields=status_code&access_token=${token}`, 'GET');
        if (result.status_code === 'FINISHED') return;
        if (result.status_code === 'ERROR') throw new Error('Container processing failed with ERROR status.');
        await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error('Timed out waiting for container to finish processing.');
}

async function main() {
    const [clientId, postFilename] = process.argv.slice(2);

    if (!clientId || !postFilename) {
        console.error('Usage: bun scripts/publish-social-post.ts <client_id> <post_filename>');
        process.exit(1);
    }

    const token = process.env.META_PAGE_ACCESS_TOKEN;
    const pageId = process.env.META_PAGE_ID;
    const igAccountId = process.env.META_INSTAGRAM_ACCOUNT_ID;

    if (!token || !pageId || !igAccountId) {
        console.error('Missing Meta credentials. Add META_PAGE_ACCESS_TOKEN, META_PAGE_ID, and META_INSTAGRAM_ACCOUNT_ID to .env');
        process.exit(1);
    }

    const postPath = path.resolve(`clients/${clientId}/posts/${postFilename}`);
    const raw = JSON.parse(await fs.readFile(postPath, 'utf-8'));
    const post: Post = raw.result;

    if (post.status !== 'approved') {
        console.error(`Post status is "${post.status}". Only approved posts can be published.`);
        process.exit(1);
    }

    // Find media file
    const postsDir = path.resolve(`clients/${clientId}/posts`);
    const prefix = postFilename.replace('.json', '');
    const allFiles = await fs.readdir(postsDir);
    const mediaFile = allFiles.find(f => f !== postFilename && (f.startsWith(prefix + '.') || f.startsWith(prefix + '-')));

    if (!mediaFile) {
        console.error('No media file found for this post. Attach an image or video before publishing.');
        process.exit(1);
    }

    const caption = `${post.content}\n\n${post.hashtags.join(' ')}`.trim();
    console.log(`\nPublishing "${post.title}" to Instagram...`);
    console.log(`Media: ${mediaFile} | Type: ${post.media_type}`);

    // For Instagram publishing, media must be accessible via a public URL.
    // This script assumes you are running behind a tunneling service (ngrok, cloudflare tunnel, etc.)
    // and the media is served at MEDIA_PUBLIC_BASE_URL/<client_id>/<filename>.
    const publicBaseUrl = process.env.MEDIA_PUBLIC_BASE_URL;
    if (!publicBaseUrl) {
        console.error('MEDIA_PUBLIC_BASE_URL not set. Instagram requires a public URL to access the media file.');
        console.error('Set it to your local tunnel URL, e.g.: MEDIA_PUBLIC_BASE_URL=https://xyz.ngrok.io/api/media');
        process.exit(1);
    }

    const mediaUrl = `${publicBaseUrl}/${clientId}/${mediaFile}`;
    const isVideo = /\.(mp4|webm|mov)$/i.test(mediaFile);

    console.log(`\n[1/3] Creating media container...`);
    const containerPayload: Record<string, string> = {
        caption,
        access_token: token,
    };

    if (isVideo) {
        containerPayload.media_type = 'REELS';
        containerPayload.video_url = mediaUrl;
        containerPayload.share_to_feed = 'true';
    } else {
        containerPayload.image_url = mediaUrl;
    }

    const container = await graphApi(`/${igAccountId}/media`, 'POST', containerPayload);
    const containerId = container.id;
    console.log(`    Container created: ${containerId}`);

    console.log(`[2/3] Waiting for container to finish processing...`);
    await waitForContainer(igAccountId, containerId, token);
    console.log(`    Container ready.`);

    console.log(`[3/3] Publishing...`);
    const published = await graphApi(`/${igAccountId}/media_publish`, 'POST', {
        creation_id: containerId,
        access_token: token,
    });
    console.log(`    Published! Media ID: ${published.id}`);

    // Update local status to published
    raw.result.status = 'published';
    await fs.writeFile(postPath, JSON.stringify(raw, null, 4), 'utf-8');

    console.log(`\nDone. Local status updated to "published".`);
}

main().catch(err => {
    console.error('\nPublish failed:', err.message || err);
    process.exit(1);
});
