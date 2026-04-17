import fs from 'node:fs/promises';
import path from 'node:path';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CLIENTS_DIR = path.resolve('../clients');

function isValidSegment(s: string): boolean {
	return s === path.basename(s) && /^[a-z0-9][a-z0-9-_.]*$/i.test(s);
}

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const { client_id, filename } = params;

	if (!isValidSegment(client_id) || !isValidSegment(filename)) {
		return json({ error: 'Invalid parameters' }, { status: 400 });
	}

	const filePath = path.join(CLIENTS_DIR, client_id, 'posts', filename);

	try {
		const data = await fs.readFile(filePath, 'utf-8');
		const parsed = JSON.parse(data);

		if (parsed.result) {
			if (body.title !== undefined) parsed.result.title = body.title;
			if (body.content !== undefined) parsed.result.content = body.content;
			if (body.hashtags !== undefined) parsed.result.hashtags = body.hashtags;
			if (body.status !== undefined) parsed.result.status = body.status;
			if (body.media_type !== undefined) parsed.result.media_type = body.media_type;

			await fs.writeFile(filePath, JSON.stringify(parsed, null, 4), 'utf-8');
			return json({ success: true });
		}
		
		return json({ success: false, error: 'Invalid post format' }, { status: 400 });
	} catch (e) {
		return json({ success: false, error: 'Post not found' }, { status: 404 });
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const { client_id, filename } = params;

	if (!isValidSegment(client_id) || !isValidSegment(filename)) {
		return json({ error: 'Invalid parameters' }, { status: 400 });
	}

	const filePath = path.join(CLIENTS_DIR, client_id, 'posts', filename);

	try {
		const raw = await fs.readFile(filePath, 'utf-8');
		const parsed = JSON.parse(raw);

		if (!parsed.result) return json({ error: 'Invalid post format' }, { status: 400 });

		const allowed = ['status', 'title', 'content', 'hashtags', 'media_type', 'scheduled_date', 'scheduled_time', 'platform'];
		for (const key of allowed) {
			if (body[key] !== undefined) parsed.result[key] = body[key];
		}

		await fs.writeFile(filePath, JSON.stringify(parsed, null, 4), 'utf-8');
		return json({ success: true });
	} catch {
		return json({ error: 'Post not found' }, { status: 404 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { client_id, filename } = params;

	if (!isValidSegment(client_id) || !isValidSegment(filename)) {
		return json({ error: 'Invalid parameters' }, { status: 400 });
	}

	const prefix = filename.replace('.json', '');
	const postsDir = path.join(CLIENTS_DIR, client_id, 'posts');
	const filePath = path.join(postsDir, filename);

	try {
		await fs.unlink(filePath);
		
		// Try to delete associated media files
		try {
			const entries = await fs.readdir(postsDir);
			for (const entry of entries) {
				if (entry !== filename && (entry.startsWith(prefix + '.') || entry.startsWith(prefix + '-'))) {
					await fs.unlink(path.join(postsDir, entry)).catch(() => {});
				}
			}
		} catch (e) {
			// ignore media read errors
		}

		return json({ success: true });
	} catch (e) {
		return json({ success: false, error: 'Failed to delete post' }, { status: 500 });
	}
};
