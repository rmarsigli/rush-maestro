import path from 'node:path';
import { json } from '@sveltejs/kit';
import { createPost } from '$lib/server/posts';
import type { RequestHandler } from './$types';
import type { PostStatus, MediaType } from '$lib/server/posts';

function isValidSegment(s: string): boolean {
	return s === path.basename(s) && /^[a-z0-9][a-z0-9-_.]*$/i.test(s);
}

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json() as Record<string, unknown>;
	const { client_id } = params;

	if (!isValidSegment(client_id)) {
		return json({ error: 'Invalid client_id' }, { status: 400 });
	}

	const result = body.result as Record<string, unknown> | undefined;

	if (!result?.id) {
		return json({ success: false, error: 'Invalid format. Missing result.id' }, { status: 400 });
	}

	const rawId = String(result.id);
	const id = rawId.replace(/[^a-z0-9-_.]/gi, '_').toLowerCase();
	const filename = id + '.json';

	try {
		createPost({
			id,
			tenant_id: client_id,
			status: (result.status as PostStatus) ?? 'draft',
			title: (result.title as string) ?? null,
			content: (result.content as string) ?? '',
			hashtags: (result.hashtags as string[]) ?? [],
			media_type: (result.media_type as MediaType) ?? null,
			workflow: (body.workflow as Record<string, unknown>) ?? null,
			media_path: null,
			scheduled_date: null,
			scheduled_time: null,
			published_at: null,
		});

		return json({ success: true, filename });
	} catch {
		return json({ success: false, error: 'Failed to import post' }, { status: 500 });
	}
};
