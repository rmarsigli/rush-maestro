import { getClients, getClientGoogleAds } from '$lib/server/db';
import { getLiveCampaigns } from '$lib/server/googleAds';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const clients = await getClients();
	const client = clients.find(c => c.id === params.tenant);
	
	if (!client) {
		error(404, 'Client not found');
	}

	const campaigns = await getClientGoogleAds(params.tenant);

	return {
		tenant: params.tenant,
		client,
		campaigns,
		streamed: {
			liveCampaigns: getLiveCampaigns(client.brand.google_ads_id, params.tenant)
		}
	};
};