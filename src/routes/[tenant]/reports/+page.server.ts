import { listReports } from '$lib/server/reports';
import type { PageServerLoad } from './$types';

const TYPE_MAP: Record<string, { label: string; color: string }> = {
	audit:   { label: 'Audit',           color: 'amber'   },
	search:  { label: 'Search Campaign', color: 'blue'    },
	weekly:  { label: 'Weekly',          color: 'emerald' },
	monthly: { label: 'Monthly',         color: 'violet'  },
	alert:   { label: 'Alert',           color: 'red'     },
	report:  { label: 'Report',          color: 'slate'   },
};

export const load: PageServerLoad = async ({ params }) => {
	const rows = listReports(params.tenant);

	const reports = rows.map((r) => {
		const dateMatch = r.slug.match(/(\d{4}-\d{2}-\d{2})/);
		return {
			slug: r.slug,
			date: dateMatch?.[1] ?? null,
			title: r.title ?? r.slug,
			...(TYPE_MAP[r.type] ?? TYPE_MAP.report),
		};
	});

	return { tenant: params.tenant, reports };
};
