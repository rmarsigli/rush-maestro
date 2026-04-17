import { getClients } from '$lib/server/db';
import { getLastRun, getAllRecentRuns } from '$db/agent-runs';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { AgentRunRow } from '$db/agent-runs';

export interface ScheduleData {
	tenant: string;
	lastRun: AgentRunRow | null;
	runs: AgentRunRow[];
	cronCommand: string;
}

export const load: PageServerLoad = async ({ params }) => {
	const clients = await getClients();
	const client = clients.find(c => c.id === params.tenant);
	if (!client) error(404, 'Client not found');

	const lastRun  = getLastRun('collect-daily-metrics', params.tenant);
	const runs     = getAllRecentRuns(params.tenant, 30);
	const cronCommand = `3 7 * * * cd /home/rafhael/www/html/marketing && bun run scripts/collect-daily-metrics.ts ${params.tenant} >> /tmp/ads-monitor.log 2>&1`;

	return { tenant: params.tenant, client, lastRun, runs, cronCommand } satisfies ScheduleData & { client: typeof client };
};
