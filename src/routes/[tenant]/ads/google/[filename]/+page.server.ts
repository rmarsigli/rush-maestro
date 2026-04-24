import { getCampaign } from '$lib/server/campaigns';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const slug = params.filename.replace(/\.json$/, '');
	const c = getCampaign(params.tenant, slug);

	if (!c) {
		error(404, 'Campaign not found');
	}

	const result = (c.data.result ?? {}) as Record<string, unknown>;
	const campaign = {
		...result,
		client_id: c.tenant_id,
		filename: c.slug + '.json',
		workflow: (c.data.workflow ?? {}) as Record<string, unknown>,
	};

	return { tenant: params.tenant, campaign };
};
