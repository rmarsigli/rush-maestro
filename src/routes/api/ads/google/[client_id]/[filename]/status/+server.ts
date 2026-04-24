import path from 'node:path';
import { json } from '@sveltejs/kit';
import { getCampaign, upsertCampaign } from '$lib/server/campaigns';
import type { RequestHandler } from './$types';

function isValidSegment(s: string): boolean {
	return s === path.basename(s) && /^[a-z0-9][a-z0-9-_.]*$/i.test(s);
}

export const POST: RequestHandler = async ({ params, request }) => {
	const { client_id, filename } = params;

	if (!isValidSegment(client_id) || !isValidSegment(filename)) {
		return json({ error: 'Invalid parameters' }, { status: 400 });
	}

	const { status } = await request.json() as { status: string };
	const allowed = ['draft', 'approved', 'published'];
	if (!allowed.includes(status)) {
		return json({ error: 'Invalid status' }, { status: 400 });
	}

	const slug = filename.replace(/\.json$/, '');
	const campaign = getCampaign(client_id, slug);
	if (!campaign) return json({ success: false, error: 'Campaign not found' }, { status: 404 });

	const updated = { ...campaign.data };
	const result = (updated.result ?? {}) as Record<string, unknown>;
	result.status = status;
	updated.result = result;

	upsertCampaign(client_id, slug, updated);
	return json({ success: true });
};
