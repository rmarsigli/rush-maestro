import { json } from '@sveltejs/kit';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getTenant } from '$lib/server/tenants';
import { getCampaign } from '$lib/server/campaigns';
import type { RequestHandler } from './$types';

function isValidSegment(s: string): boolean {
	return s === path.basename(s) && /^[a-z0-9][a-z0-9-_.]*$/i.test(s);
}

export const POST: RequestHandler = async ({ params }) => {
	const { client_id, filename } = params;

	if (!isValidSegment(client_id) || !isValidSegment(filename)) {
		return json({ error: 'Invalid parameters' }, { status: 400 });
	}

	const slug = filename.replace(/\.json$/i, '');
	const tenant = getTenant(client_id);
	if (!tenant) return json({ error: `Tenant "${client_id}" not found` }, { status: 404 });

	const campaign = getCampaign(client_id, slug);
	if (!campaign) return json({ error: `Campaign "${slug}" not found` }, { status: 404 });

	// Write campaign data to a temp file for the deploy script
	const tmpPath = path.join('/tmp', `deploy-${slug}-${Date.now()}.json`);
	await fs.writeFile(tmpPath, JSON.stringify(campaign.data, null, 2), 'utf-8');

	const scriptPath = path.resolve('scripts/deploy-google-ads.ts');

	try {
		const result = spawnSync('bun', ['run', scriptPath, tmpPath, client_id], {
			cwd: path.resolve('.'),
			encoding: 'utf-8',
			timeout: 90_000,
			env: process.env,
		});

		if (result.status !== 0) {
			const errorMsg = result.stderr?.trim() || result.stdout?.trim() || 'Deploy failed with no output.';
			return json({ success: false, error: errorMsg }, { status: 500 });
		}

		return json({ success: true, output: result.stdout?.trim() });
	} finally {
		await fs.unlink(tmpPath).catch(() => {});
	}
};
