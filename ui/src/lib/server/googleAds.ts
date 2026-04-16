import { GoogleAdsApi } from 'google-ads-api';
import dotenv from 'dotenv';
import path from 'node:path';

// Load the root .env file since ui/.env might not have them
dotenv.config({ path: path.resolve('../.env') });

export interface LiveCampaign {
    id: string;
    name: string;
    status: string;
    impressions?: string;
    clicks?: string;
    cost?: string;
}

export async function getLiveCampaigns(customerId?: string): Promise<LiveCampaign[]> {
    if (!customerId) return [];

    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '');

    if (!clientId || !clientSecret || !developerToken || !refreshToken) {
        console.warn('Google Ads credentials are missing in .env');
        return [];
    }

    try {
        const client = new GoogleAdsApi({
            client_id: clientId,
            client_secret: clientSecret,
            developer_token: developerToken,
        });

        const cleanCustomerId = customerId.replace(/-/g, '');

        const customer = client.Customer({
            customer_id: cleanCustomerId,
            ...(loginCustomerId ? { login_customer_id: loginCustomerId } : {}),
            refresh_token: refreshToken
        });

        // Simple query to get campaigns and some basic metrics
        const campaigns = await customer.query(`
            SELECT 
                campaign.id, 
                campaign.name, 
                campaign.status,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros
            FROM campaign 
            WHERE campaign.status != 'REMOVED'
            ORDER BY campaign.name
            LIMIT 50
        `);

        return campaigns.map((row: any) => {
            let mappedStatus = String(row.campaign.status);
            if (row.campaign.status === 2 || row.campaign.status === 'ENABLED') mappedStatus = 'ENABLED';
            if (row.campaign.status === 3 || row.campaign.status === 'PAUSED') mappedStatus = 'PAUSED';
            if (row.campaign.status === 4 || row.campaign.status === 'REMOVED') mappedStatus = 'REMOVED';

            return {
                id: row.campaign.id.toString(),
                name: row.campaign.name,
                status: mappedStatus,
                impressions: row.metrics?.impressions?.toString() || '0',
                clicks: row.metrics?.clicks?.toString() || '0',
                cost: row.metrics?.cost_micros ? (Number(row.metrics.cost_micros) / 1000000).toFixed(2) : '0.00'
            };
        });
    } catch (error) {
        console.error('Failed to fetch live campaigns from Google Ads:', error);
        return [];
    }
}
