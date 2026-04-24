import { GoogleAdsApi } from 'google-ads-api';
import { env } from '$env/dynamic/private';

export interface LiveCampaign {
    id: string;
    name: string;
    status: string;
    impressions?: string;
    clicks?: string;
    cost?: string;
}

interface CampaignRow {
    campaign: { id: number | bigint; name: string; status: number | string };
    metrics?: { impressions?: number; clicks?: number; cost_micros?: number | bigint };
}

function mapStatus(raw: number | string): string {
    if (raw === 2 || raw === 'ENABLED') return 'ENABLED';
    if (raw === 3 || raw === 'PAUSED')  return 'PAUSED';
    if (raw === 4 || raw === 'REMOVED') return 'REMOVED';
    return String(raw);
}

export async function getLiveCampaigns(customerId?: string): Promise<LiveCampaign[]> {
    if (!customerId) return [];

    const clientId        = env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret    = env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken  = env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refreshToken    = env.GOOGLE_ADS_REFRESH_TOKEN;
    const loginCustomerId = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '');

    if (!clientId || !clientSecret || !developerToken || !refreshToken) {
        const missing = [
            !clientId        && 'GOOGLE_ADS_CLIENT_ID',
            !clientSecret    && 'GOOGLE_ADS_CLIENT_SECRET',
            !developerToken  && 'GOOGLE_ADS_DEVELOPER_TOKEN',
            !refreshToken    && 'GOOGLE_ADS_REFRESH_TOKEN',
        ].filter(Boolean);
        console.error(`[Google Ads] Missing env vars: ${missing.join(', ')}`);
        return [];
    }

    try {
        const client = new GoogleAdsApi({
            client_id: clientId,
            client_secret: clientSecret,
            developer_token: developerToken,
        });

        const customer = client.Customer({
            customer_id: customerId.replace(/-/g, ''),
            refresh_token: refreshToken,
            ...(loginCustomerId ? { login_customer_id: loginCustomerId } : {}),
        });

        const rows = await customer.query(`
            SELECT
                campaign.id, campaign.name, campaign.status,
                metrics.impressions, metrics.clicks, metrics.cost_micros
            FROM campaign
            WHERE campaign.status != 'REMOVED'
            ORDER BY campaign.name
            LIMIT 50
        `) as CampaignRow[];

        return rows.map((row) => ({
            id:          row.campaign.id.toString(),
            name:        row.campaign.name,
            status:      mapStatus(row.campaign.status),
            impressions: row.metrics?.impressions?.toString() ?? '0',
            clicks:      row.metrics?.clicks?.toString() ?? '0',
            cost:        row.metrics?.cost_micros
                ? (Number(row.metrics.cost_micros) / 1_000_000).toFixed(2)
                : '0.00',
        }));
    } catch (err) {
        console.error('[Google Ads] API error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(msg.includes('invalid_grant') ? 'invalid_grant' : msg);
    }
}
