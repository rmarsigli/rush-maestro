import { getClients } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, cookies }) => {
	const clients = await getClients();
	const client = clients.find((c) => c.id === params.tenant);

	if (!client) {
		error(404, 'Client not found');
	}

	cookies.set('last_tenant', params.tenant, {
		path: '/',
		maxAge: 60 * 60 * 24 * 30,
		sameSite: 'lax',
		httpOnly: true,
		secure: false,
	});

	return {
		tenant: params.tenant,
		client,
		clients,
	};
};
