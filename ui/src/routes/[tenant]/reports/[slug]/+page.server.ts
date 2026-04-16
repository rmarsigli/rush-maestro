import fs from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import { getClients } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const CLIENTS_DIR = path.resolve('../clients');

marked.setOptions({ gfm: true });

export const load: PageServerLoad = async ({ params }) => {
	const clients = await getClients();
	const client = clients.find(c => c.id === params.tenant);
	if (!client) error(404, 'Client not found');

	const filePath = path.join(CLIENTS_DIR, params.tenant, 'reports', `${params.slug}.md`);

	try {
		const raw = await fs.readFile(filePath, 'utf-8');
		const html = marked.parse(raw) as string;
		const dateMatch = params.slug.match(/(\d{4}-\d{2}-\d{2})/);
		return {
			tenant: params.tenant,
			client,
			slug: params.slug,
			date: dateMatch?.[1] ?? null,
			html,
		};
	} catch {
		error(404, `Relatório "${params.slug}" não encontrado`);
	}
};
