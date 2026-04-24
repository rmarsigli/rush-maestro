import { GoogleAdsApi } from 'google-ads-api';
import { env } from '$env/dynamic/private';
import { getCredentialsForTenant } from '$lib/server/integrations';

export interface AdGroupMetrics {
    impressions: string;
    clicks: string;
    conversions: string;
    conversionsValue: string;
    ctr: string;
    cost: string;
}

export interface CampaignAdGroup {
    id: string;
    name: string;
    status: string;
    metrics: AdGroupMetrics;
}

export interface HistoryEntry {
    date: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionsValue: number;
}

export interface DetailedCampaign {
    id: string;
    name: string;
    status: string;
    strategy: number | string | undefined;
    metrics: {
        impressions: string;
        clicks: string;
        conversions: string;
        conversionsValue: string;
        roas: string;
        interactionRate: string;
        searchImpressionShare: string;
        cost: string;
        ctr: string;
        cpa: string;
    };
    adGroups: CampaignAdGroup[];
    history: HistoryEntry[];
}

interface CampaignRow {
    campaign: {
        id?: number | bigint;
        name: string;
        status: number | string;
        bidding_strategy_type?: number | string;
    };
    metrics?: {
        impressions?: number;
        clicks?: number;
        cost_micros?: number | bigint;
        conversions?: number;
        conversions_value?: number;
        cost_per_conversion?: number;
        ctr?: number;
        interaction_rate?: number;
        search_impression_share?: number;
    };
}

interface AdGroupRow {
    ad_group: { id: number | bigint; name: string; status: number | string };
    metrics?: {
        impressions?: number;
        clicks?: number;
        cost_micros?: number | bigint;
        conversions?: number;
        conversions_value?: number;
        ctr?: number;
    };
}

interface HistoryRow {
    segments?: { date: string };
    metrics?: {
        impressions?: number;
        clicks?: number;
        cost_micros?: number | bigint;
        conversions?: number;
        conversions_value?: number;
    };
}

function mapStatus(raw: number | string): string {
    if (raw === 2 || raw === 'ENABLED') return 'ENABLED';
    if (raw === 3 || raw === 'PAUSED')  return 'PAUSED';
    return String(raw);
}

function pct(value: number | undefined, fallback = '0%'): string {
    return value != null ? (value * 100).toFixed(2) + '%' : fallback;
}

function fromMicros(value: number | bigint | undefined, fallback = '0.00'): string {
    return value != null ? (Number(value) / 1_000_000).toFixed(2) : fallback;
}

function resolveDetailedCreds(tenantId: string) {
    const dbCreds = getCredentialsForTenant(tenantId, 'google_ads');
    if (dbCreds) return dbCreds;

    const clientId        = env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret    = env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken  = env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refreshToken    = env.GOOGLE_ADS_REFRESH_TOKEN;
    const loginCustomerId = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '') ?? '';

    if (!clientId || !clientSecret || !developerToken || !refreshToken) return null;

    return {
        oauth_client_id: clientId,
        oauth_client_secret: clientSecret,
        developer_token: developerToken,
        login_customer_id: loginCustomerId,
        refresh_token: refreshToken,
    };
}

export async function getDetailedCampaign(
    customerId: string | undefined,
    campaignId: string | undefined,
    tenantId: string,
    startDate?: string,
    endDate?: string,
): Promise<DetailedCampaign | null> {
    if (!customerId || !campaignId) {
        throw new Error(`Missing IDs. customerId=${customerId}, campaignId=${campaignId}`);
    }

    const creds = resolveDetailedCreds(tenantId);
    if (!creds) {
        throw new Error(`No Google Ads credentials found for tenant "${tenantId}"`);
    }

    try {
        const client = new GoogleAdsApi({
            client_id: creds.oauth_client_id,
            client_secret: creds.oauth_client_secret,
            developer_token: creds.developer_token,
        });

        const loginCustomerId = creds.login_customer_id?.replace(/-/g, '');
        const customer = client.Customer({
            customer_id: customerId.replace(/-/g, ''),
            refresh_token: creds.refresh_token,
            ...(loginCustomerId ? { login_customer_id: loginCustomerId } : {}),
        });

        const dateFilter = startDate && endDate
            ? ` AND segments.date BETWEEN '${startDate}' AND '${endDate}'`
            : '';

        const campaigns = await customer.query(`
            SELECT
                campaign.id, campaign.name, campaign.status,
                campaign.bidding_strategy_type,
                metrics.impressions, metrics.clicks, metrics.cost_micros,
                metrics.conversions, metrics.conversions_value,
                metrics.cost_per_conversion, metrics.ctr,
                metrics.interaction_rate, metrics.search_impression_share
            FROM campaign
            WHERE campaign.id = ${campaignId}${dateFilter}
        `) as CampaignRow[];

        if (campaigns.length === 0 || !campaigns[0].campaign) return null;

        const c = campaigns[0];

        const adGroupRows = await customer.query(`
            SELECT
                ad_group.id, ad_group.name, ad_group.status,
                metrics.impressions, metrics.clicks, metrics.cost_micros,
                metrics.conversions, metrics.conversions_value, metrics.ctr
            FROM ad_group
            WHERE campaign.id = ${campaignId}${dateFilter}
        `) as AdGroupRow[];

        const chartFilter = dateFilter || ' AND segments.date DURING LAST_30_DAYS';
        const historyRows = await customer.query(`
            SELECT
                segments.date,
                metrics.impressions, metrics.clicks, metrics.cost_micros,
                metrics.conversions, metrics.conversions_value
            FROM campaign
            WHERE campaign.id = ${campaignId}${chartFilter}
            ORDER BY segments.date ASC
        `) as HistoryRow[];

        const cost  = Number(c.metrics?.cost_micros ?? 0) / 1_000_000;
        const value = Number(c.metrics?.conversions_value ?? 0);

        return {
            id:       c.campaign.id?.toString() ?? '',
            name:     c.campaign.name,
            status:   mapStatus(c.campaign.status),
            strategy: c.campaign.bidding_strategy_type,
            metrics: {
                impressions:          c.metrics?.impressions?.toString() ?? '0',
                clicks:               c.metrics?.clicks?.toString() ?? '0',
                conversions:          c.metrics?.conversions?.toString() ?? '0',
                conversionsValue:     c.metrics?.conversions_value != null ? Number(c.metrics.conversions_value).toFixed(2) : '0.00',
                roas:                 cost > 0 ? ((value / cost) * 100).toFixed(2) + '%' : '0%',
                interactionRate:      pct(c.metrics?.interaction_rate),
                searchImpressionShare: c.metrics?.search_impression_share != null
                    ? pct(c.metrics.search_impression_share)
                    : '< 10%',
                cost: fromMicros(c.metrics?.cost_micros),
                ctr:  pct(c.metrics?.ctr),
                cpa:  fromMicros(c.metrics?.cost_per_conversion),
            },
            adGroups: adGroupRows.map((ag): CampaignAdGroup => ({
                id:     ag.ad_group.id.toString(),
                name:   ag.ad_group.name,
                status: mapStatus(ag.ad_group.status),
                metrics: {
                    impressions:     ag.metrics?.impressions?.toString() ?? '0',
                    clicks:          ag.metrics?.clicks?.toString() ?? '0',
                    conversions:     ag.metrics?.conversions?.toString() ?? '0',
                    conversionsValue: ag.metrics?.conversions_value != null ? Number(ag.metrics.conversions_value).toFixed(2) : '0.00',
                    ctr:  pct(ag.metrics?.ctr),
                    cost: fromMicros(ag.metrics?.cost_micros),
                },
            })),
            history: historyRows.map((h): HistoryEntry => ({
                date:             h.segments?.date ?? '',
                impressions:      Number(h.metrics?.impressions ?? 0),
                clicks:           Number(h.metrics?.clicks ?? 0),
                cost:             Number(h.metrics?.cost_micros ?? 0) / 1_000_000,
                conversions:      Number(h.metrics?.conversions ?? 0),
                conversionsValue: Number(h.metrics?.conversions_value ?? 0),
            })),
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : JSON.stringify(error);
        console.error('Failed to fetch detailed campaign:', error);
        throw new Error('Failed to fetch detailed campaign: ' + msg);
    }
}
