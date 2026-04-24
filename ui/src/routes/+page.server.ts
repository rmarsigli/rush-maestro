import { redirect } from '@sveltejs/kit';
import { getClients } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const clients = await getClients();

	if (clients.length === 0) {
		return {};
	}

	const lastTenant = cookies.get('last_tenant');
	if (lastTenant && clients.find((c) => c.id === lastTenant)) {
		redirect(302, `/${lastTenant}/social`);
	}

	redirect(302, `/${clients[0].id}/social`);
};
