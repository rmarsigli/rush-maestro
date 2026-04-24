import { GoogleAdsApi } from 'google-ads-api';
import { env } from '$env/dynamic/private';
import { getCredentialsForTenant } from '$lib/server/integrations';

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

function resolveCreds(tenantId: string) {
    // 1) Try DB integration
    const dbCreds = getCredentialsForTenant(tenantId, 'google_ads');
    if (dbCreds) return dbCreds;

    // 2) Fall back to env vars (transition period)
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

export async function getLiveCampaigns(customerId: string | undefined, tenantId: string): Promise<LiveCampaign[]> {
    if (!customerId) return [];

    const creds = resolveCreds(tenantId);
    if (!creds) {
        console.error(`[Google Ads] No credentials found for tenant "${tenantId}"`);
        return [];
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
