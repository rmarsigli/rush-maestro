import { getDetailedCampaign } from '$lib/server/googleAdsDetailed';
import { getClients } from '$lib/server/db';
import { getLastNDays, getMonthlySummary } from '$db/monitoring';
import { getOpenAlerts } from '$db/alerts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { AlertEventRow } from '$db/alerts';

export interface WoWMetrics {
	cur:  { cost: number; conversions: number; clicks: number; impressions: number };
	prev: { cost: number; conversions: number; clicks: number; impressions: number };
}

export interface DbHistoryDay {
	date: string;
	cost: number;
	conversions: number;
	clicks: number;
	impressions: number;
	cpa: number;
	budgetMicros: number;
}

export interface MonthlyStat {
	totalCost: number;
	totalConversions: number;
	totalClicks: number;
	daysActive: number;
	avgCpa: number;
}

function sumField(
	rows: ReturnType<typeof getLastNDays>,
	field: 'cost_micros' | 'conversions' | 'clicks' | 'impressions'
): number {
	return rows.reduce((s, r) => s + Number(r[field]), 0);
}

export const load: PageServerLoad = async ({ params, url }) => {
	const clients = await getClients();
	const client = clients.find(c => c.id === params.tenant);

	if (!client) error(404, 'Client not found');

	const startDate = url.searchParams.get('startDate') || undefined;
	const endDate   = url.searchParams.get('endDate')   || undefined;

	const campaign = await getDetailedCampaign(
		client.brand.google_ads_id, params.campaign_id, params.tenant, startDate, endDate
	);

	if (!campaign) error(404, 'Live campaign not found in Google Ads');

	// ── SQLite: historical context ────────────────────────────────────────────

	const history14 = getLastNDays(params.tenant, params.campaign_id, 14);
	const curWeek   = history14.slice(0, 7);
	const prevWeek  = history14.slice(7, 14);

	const wow: WoWMetrics = {
		cur: {
			cost:        sumField(curWeek, 'cost_micros') / 1e6,
			conversions: sumField(curWeek, 'conversions'),
			clicks:      sumField(curWeek, 'clicks'),
			impressions: sumField(curWeek, 'impressions'),
		},
		prev: {
			cost:        sumField(prevWeek, 'cost_micros') / 1e6,
			conversions: sumField(prevWeek, 'conversions'),
			clicks:      sumField(prevWeek, 'clicks'),
			impressions: sumField(prevWeek, 'impressions'),
		},
	};

	// Budget pacing from most recent DB day
	const latestDay   = history14[0] ?? null;
	const budgetPacing = latestDay && Number(latestDay.budget_micros) > 0
		? { date: latestDay.date, pct: Number(latestDay.cost_micros) / Number(latestDay.budget_micros), cost: Number(latestDay.cost_micros) / 1e6, budget: Number(latestDay.budget_micros) / 1e6 }
		: null;

	// 30-day daily history for chart
	const history30  = getLastNDays(params.tenant, params.campaign_id, 30).reverse();
	const dbHistory: DbHistoryDay[] = history30.map(r => ({
		date:         r.date,
		cost:         Number(r.cost_micros) / 1e6,
		conversions:  Number(r.conversions),
		clicks:       Number(r.clicks),
		impressions:  Number(r.impressions),
		cpa:          Number(r.conversions) > 0 ? (Number(r.cost_micros) / 1e6) / Number(r.conversions) : 0,
		budgetMicros: Number(r.budget_micros),
	}));

	// Monthly summary (current month)
	const month = new Date().toISOString().substring(0, 7);
	const ms    = getMonthlySummary(params.tenant, params.campaign_id, month);
	const monthly: MonthlyStat | null = ms ? {
		totalCost:        ms.total_cost_micros / 1e6,
		totalConversions: ms.total_conversions,
		totalClicks:      ms.total_clicks,
		daysActive:       ms.days_active,
		avgCpa:           ms.avg_cpa_micros / 1e6,
	} : null;

	// Open alerts for this campaign
	const openAlerts: AlertEventRow[] = getOpenAlerts(params.tenant)
		.filter(a => a.campaign_id === params.campaign_id);

	return {
		tenant: params.tenant,
		client,
		campaign,
		wow,
		budgetPacing,
		dbHistory,
		monthly,
		openAlerts,
	};
};
