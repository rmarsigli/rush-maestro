import { getTenant } from '$lib/server/tenants';
import { listCampaigns } from '$lib/server/campaigns';
import { getLiveCampaigns } from '$lib/server/googleAds';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const tenant = getTenant(params.tenant);

	if (!tenant) {
		error(404, 'Client not found');
	}

	const rawCampaigns = listCampaigns(params.tenant);

	// Map to the shape the component expects (result.* + filename, client_id, workflow)
	const campaigns = rawCampaigns.map((c) => {
		const result = (c.data.result ?? {}) as Record<string, unknown>;
		return {
			...result,
			client_id: c.tenant_id,
			filename: c.slug + '.json',
			workflow: (c.data.workflow ?? {}) as Record<string, unknown>,
		};
	});

	return {
		tenant: params.tenant,
		client: { id: tenant.id, brand: { name: tenant.name, niche: tenant.niche, google_ads_id: tenant.google_ads_id } },
		campaigns,
		streamed: {
			liveCampaigns: getLiveCampaigns(tenant.google_ads_id ?? undefined, params.tenant),
		},
	};
};
