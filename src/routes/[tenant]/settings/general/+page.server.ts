import { getTenant, updateTenant } from '$lib/server/tenants';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const tenant = getTenant(params.tenant);
	if (!tenant) error(404, 'Client not found');

	return {
		tenant: params.tenant,
		client: { id: tenant.id, brand: { name: tenant.name, niche: tenant.niche, google_ads_id: tenant.google_ads_id } },
		brand: {
			name: tenant.name,
			niche: tenant.niche ?? '',
			google_ads_id: tenant.google_ads_id ?? '',
		},
	};
};

export const actions: Actions = {
	saveBrand: async ({ params, request }) => {
		const form = await request.formData();
		const name = (form.get('name') as string)?.trim();
		const niche = (form.get('niche') as string)?.trim() ?? '';
		const google_ads_id = (form.get('google_ads_id') as string)?.trim() || null;

		if (!name) return fail(400, { error: 'Brand name is required' });

		updateTenant(params.tenant, { name, niche: niche || null, google_ads_id });

		return { success: true };
	},
};
