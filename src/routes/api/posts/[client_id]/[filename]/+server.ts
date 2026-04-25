import path from 'node:path';
import { json } from '@sveltejs/kit';
import { getPost, updatePost, deletePost } from '$lib/server/posts';
import { storage } from '$lib/server/storage';
import type { RequestHandler } from './$types';
import type { PostStatus, MediaType } from '$lib/server/posts';

function isValidSegment(s: string): boolean {
	return s === path.basename(s) && /^[a-z0-9][a-z0-9-_.]*$/i.test(s);
}

function postId(filename: string): string {
	return filename.replace(/\.json$/, '');
}

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json() as Record<string, unknown>;
	const { client_id, filename } = params;

	if (!isValidSegment(client_id) || !isValidSegment(filename)) {
		return json({ error: 'Invalid parameters' }, { status: 400 });
	}

	const id = postId(filename);
	const post = getPost(id);
	if (!post) return json({ success: false, error: 'Post not found' }, { status: 404 });

	const patch: Parameters<typeof updatePost>[1] = {};
	if (body.title !== undefined) patch.title = body.title as string;
	if (body.content !== undefined) patch.content = body.content as string;
	if (body.hashtags !== undefined) patch.hashtags = body.hashtags as string[];
	if (body.platform !== undefined) patch.platform = body.platform as string[];
	if (body.status !== undefined) patch.status = body.status as PostStatus;
	if (body.media_type !== undefined) patch.media_type = body.media_type as MediaType;
	if (body.scheduled_date !== undefined) patch.scheduled_date = body.scheduled_date as string | null;
	if (body.scheduled_time !== undefined) patch.scheduled_time = body.scheduled_time as string | null;

	updatePost(id, patch);
	return json({ success: true });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = await request.json() as Record<string, unknown>;
	const { client_id, filename } = params;

	if (!isValidSegment(client_id) || !isValidSegment(filename)) {
		return json({ error: 'Invalid parameters' }, { status: 400 });
	}

	const id = postId(filename);
	const post = getPost(id);
	if (!post) return json({ error: 'Post not found' }, { status: 404 });

	const patch: Parameters<typeof updatePost>[1] = {};
	const allowed: (keyof typeof patch)[] = ['status', 'title', 'content', 'hashtags', 'platform', 'media_type', 'scheduled_date', 'scheduled_time'];
	for (const key of allowed) {
		if (body[key] !== undefined) (patch as Record<string, unknown>)[key] = body[key];
	}

	updatePost(id, patch);
	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { client_id, filename } = params;

	if (!isValidSegment(client_id) || !isValidSegment(filename)) {
		return json({ error: 'Invalid parameters' }, { status: 400 });
	}

	const id = postId(filename);
	const post = getPost(id);
	if (!post) return json({ success: false, error: 'Post not found' }, { status: 404 });

	if (post.media_path && storage.exists(client_id, post.media_path)) {
		await storage.delete(client_id, post.media_path).catch(() => {});
	}

	deletePost(id);
	return json({ success: true });
};
