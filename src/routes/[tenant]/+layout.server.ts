import { listTenants, getTenant } from '$lib/server/tenants';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, cookies }) => {
	const tenant = getTenant(params.tenant);

	if (!tenant) {
		error(404, 'Client not found');
	}

	const tenants = listTenants();

	cookies.set('last_tenant', params.tenant, {
		path: '/',
		maxAge: 60 * 60 * 24 * 30,
		sameSite: 'lax',
		httpOnly: true,
		secure: false,
	});

	// Map to the shape the layout component expects: { id, brand: { name, ... } }
	const toClient = (t: typeof tenant) => ({ id: t.id, brand: { name: t.name, niche: t.niche, google_ads_id: t.google_ads_id, ads_monitoring: t.ads_monitoring } });

	return {
		tenant: params.tenant,
		client: toClient(tenant),
		clients: tenants.map(toClient),
	};
};
