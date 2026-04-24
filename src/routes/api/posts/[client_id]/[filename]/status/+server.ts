import path from 'node:path';
import { json } from '@sveltejs/kit';
import { updatePostStatus } from '$lib/server/posts';
import type { RequestHandler } from './$types';
import type { PostStatus } from '$lib/server/posts';

function isValidSegment(s: string): boolean {
	return s === path.basename(s) && /^[a-z0-9][a-z0-9-_.]*$/i.test(s);
}

const ALLOWED_STATUSES: PostStatus[] = ['draft', 'approved', 'scheduled', 'published'];

export const POST: RequestHandler = async ({ params, request }) => {
	const { status } = await request.json() as { status: PostStatus };
	const { client_id, filename } = params;

	if (!isValidSegment(client_id) || !isValidSegment(filename)) {
		return json({ error: 'Invalid parameters' }, { status: 400 });
	}

	if (!ALLOWED_STATUSES.includes(status)) {
		return json({ error: 'Invalid status' }, { status: 400 });
	}

	const id = filename.replace(/\.json$/, '');
	updatePostStatus(id, status);
	return json({ success: true });
};
