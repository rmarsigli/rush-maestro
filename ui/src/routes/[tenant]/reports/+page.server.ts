import fs from 'node:fs/promises';
import path from 'node:path';
import { getClients } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const CLIENTS_DIR = path.resolve('../clients');

const TYPE_MAP: Record<string, { label: string; color: string }> = {
	audit:    { label: 'Audit',           color: 'amber'  },
	search:   { label: 'Search Campaign', color: 'blue'   },
	weekly:   { label: 'Weekly',          color: 'emerald'},
	monthly:  { label: 'Monthly',         color: 'violet' },
	alert:    { label: 'Alert',           color: 'red'    },
	report:   { label: 'Report',          color: 'slate'  },
};

function detectType(slug: string): string {
	if (slug.includes('audit'))   return 'audit';
	if (slug.includes('search') || slug.includes('campaign')) return 'search';
	if (slug.includes('weekly'))  return 'weekly';
	if (slug.includes('monthly') || /\d{4}-\d{2}$/.test(slug)) return 'monthly';
	if (slug.includes('alert'))   return 'alert';
	return 'report';
}

function formatTitle(slug: string): string {
	return slug
		.replace(/\d{4}-\d{2}-\d{2}/, '')
		.replace(/\d{4}-\d{2}/, '')
		.replace(/[-_]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ')
		.split(' ')
		.filter(Boolean)
		.map(w => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

export const load: PageServerLoad = async ({ params }) => {
	const clients = await getClients();
	const client = clients.find(c => c.id === params.tenant);
	if (!client) error(404, 'Client not found');

	const reportsDir = path.join(CLIENTS_DIR, params.tenant, 'reports');

	try {
		const files = await fs.readdir(reportsDir);
		const reports = files
			.filter(f => f.endsWith('.md'))
			.map(filename => {
				const slug = filename.replace('.md', '');
				const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})/);
				const type = detectType(slug);
				return {
					slug,
					date: dateMatch?.[1] ?? null,
					title: formatTitle(slug) || slug,
					...TYPE_MAP[type],
				};
			})
			.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

		return { tenant: params.tenant, client, reports };
	} catch {
		return { tenant: params.tenant, client, reports: [] };
	}
};
