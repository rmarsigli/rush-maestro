import { listTenants } from '$lib/server/tenants';
import {
	listIntegrations,
	createIntegration,
	updateIntegration,
	deleteIntegration,
	setIntegrationClients,
} from '$lib/server/integrations';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

function generateId(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
	const suffix = Math.random().toString(36).substring(2, 7);
	return `${slug}-${suffix}`;
}

function parseClientIds(raw: FormDataEntryValue | null): string[] {
	if (!raw || typeof raw !== 'string') return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as string[]).filter((s) => typeof s === 'string') : [];
	} catch {
		return [];
	}
}

export const load: PageServerLoad = async () => {
	const integrations = listIntegrations();
	const clientOptions = listTenants().map((t) => ({ value: t.id, label: t.name }));

	return { integrations, clientOptions };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const form = await request.formData();
		const name = (form.get('name') as string)?.trim();
		const provider = (form.get('provider') as string)?.trim();

		if (!name) return fail(400, { error: 'Name is required' });
		if (!provider) return fail(400, { error: 'Provider is required' });

		const id = generateId(name);
		const clientIds = parseClientIds(form.get('client_ids'));

		createIntegration({
			id,
			name,
			provider: provider as 'google_ads',
			oauth_client_id: (form.get('oauth_client_id') as string)?.trim() || null,
			oauth_client_secret: (form.get('oauth_client_secret') as string)?.trim() || null,
			developer_token: (form.get('developer_token') as string)?.trim() || null,
			login_customer_id: (form.get('login_customer_id') as string)?.trim() || null,
			refresh_token: null,
			status: 'pending',
			error_message: null,
		});

		if (clientIds.length > 0) setIntegrationClients(id, clientIds);

		return { success: true };
	},

	update: async ({ request }) => {
		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		if (!id) return fail(400, { error: 'Integration ID missing' });

		const name = (form.get('name') as string)?.trim();
		if (!name) return fail(400, { error: 'Name is required' });

		const clientIds = parseClientIds(form.get('client_ids'));

		updateIntegration(id, {
			name,
			oauth_client_id: (form.get('oauth_client_id') as string)?.trim() || null,
			oauth_client_secret: (form.get('oauth_client_secret') as string)?.trim() || null,
			developer_token: (form.get('developer_token') as string)?.trim() || null,
			login_customer_id: (form.get('login_customer_id') as string)?.trim() || null,
		});

		setIntegrationClients(id, clientIds);

		return { success: true };
	},

	delete: async ({ request }) => {
		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		if (!id) return fail(400, { error: 'Integration ID missing' });

		deleteIntegration(id);
		return { success: true };
	},
};
