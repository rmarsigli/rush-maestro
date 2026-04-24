import { marked } from 'marked';
import { getReport } from '$lib/server/reports';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

marked.setOptions({ gfm: true });

export const load: PageServerLoad = async ({ params }) => {
	const report = getReport(params.tenant, params.slug);

	if (!report) {
		error(404, `Relatório "${params.slug}" não encontrado`);
	}

	const html = marked.parse(report.content) as string;
	const dateMatch = params.slug.match(/(\d{4}-\d{2}-\d{2})/);

	return {
		tenant: params.tenant,
		slug: params.slug,
		date: dateMatch?.[1] ?? null,
		html,
	};
};
