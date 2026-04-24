import path from 'node:path';
import { json } from '@sveltejs/kit';
import { upsertCampaign } from '$lib/server/campaigns';
import type { RequestHandler } from './$types';

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
	if (!result?.id || result?.platform !== 'google_search') {
		return json({ error: 'Invalid format. Must contain result.id and result.platform = "google_search".' }, { status: 400 });
	}

	const slug = String(result.id).replace(/[^a-z0-9-_.]/gi, '_').toLowerCase();
	const filename = slug + '.json';

	try {
		upsertCampaign(client_id, slug, body);
		return json({ success: true, filename });
	} catch {
		return json({ success: false, error: 'Failed to save campaign' }, { status: 500 });
	}
};
