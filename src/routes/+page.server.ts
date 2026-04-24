import { redirect } from '@sveltejs/kit';
import { listTenants } from '$lib/server/tenants';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const tenants = listTenants();

	if (tenants.length === 0) {
		return {};
	}

	const lastTenant = cookies.get('last_tenant');
	if (lastTenant && tenants.find((t) => t.id === lastTenant)) {
		redirect(302, `/${lastTenant}/social`);
	}

	redirect(302, `/${tenants[0].id}/social`);
};
