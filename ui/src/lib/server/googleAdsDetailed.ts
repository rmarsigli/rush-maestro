import { GoogleAdsApi } from 'google-ads-api';
import dotenv from 'dotenv';
import path from 'node:path';

// Load the root .env file
dotenv.config({ path: path.resolve('../.env') });

export async function getDetailedCampaign(customerId?: string, campaignId?: string, startDate?: string, endDate?: string) {
    if (!customerId || !campaignId) {
        throw new Error(`Missing IDs. customerId=${customerId}, campaignId=${campaignId}`);
    }

    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '');

    if (!clientId || !clientSecret || !developerToken || !refreshToken) {
        throw new Error(`Missing Google Ads credentials. Details: clientId=${!!clientId}, secret=${!!clientSecret}, token=${!!developerToken}, refresh=${!!refreshToken}`);
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

        let dateFilter = '';
        if (startDate && endDate) {
            dateFilter = ` AND segments.date BETWEEN '${startDate}' AND '${endDate}'`;
        }

        const campaigns = await customer.query(`
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.bidding_strategy_type,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value,
                metrics.cost_per_conversion,
                metrics.ctr,
                metrics.interaction_rate,
                metrics.search_impression_share
            FROM campaign
            WHERE campaign.id = ${campaignId}${dateFilter}
        `);

        if (campaigns.length === 0) {
            return null;
        }
        
        const c = campaigns[0];
        
        if (!c.campaign) {
            return null;
        }
        
        let mappedStatus = String(c.campaign.status);
        if (c.campaign.status === 2 || c.campaign.status === 'ENABLED') mappedStatus = 'ENABLED';
        if (c.campaign.status === 3 || c.campaign.status === 'PAUSED') mappedStatus = 'PAUSED';

        // Fetch Ad Groups for the campaign
        const adGroups = await customer.query(`
            SELECT 
                ad_group.id,
                ad_group.name,
                ad_group.status,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value,
                metrics.ctr
            FROM ad_group
            WHERE campaign.id = ${campaignId}${dateFilter}
        `);

        // Fetch historical data for charts (last 30 days if no date provided, otherwise the provided range)
        let chartDateFilter = dateFilter;
        if (!dateFilter) {
            chartDateFilter = ` AND segments.date DURING LAST_30_DAYS`;
        }

        const history = await customer.query(`
            SELECT 
                segments.date,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value
            FROM campaign
            WHERE campaign.id = ${campaignId}${chartDateFilter}
            ORDER BY segments.date ASC
        `);

        return {
            id: c.campaign.id?.toString() || '',
            name: c.campaign.name,
            status: mappedStatus,
            strategy: c.campaign.bidding_strategy_type,
            metrics: {
                impressions: c.metrics?.impressions?.toString() || '0',
                clicks: c.metrics?.clicks?.toString() || '0',
                conversions: c.metrics?.conversions?.toString() || '0',
                conversionsValue: c.metrics?.conversions_value ? Number(c.metrics.conversions_value).toFixed(2) : '0.00',
                roas: (() => {
                    const cost = Number(c.metrics?.cost_micros || 0) / 1_000_000;
                    const value = Number(c.metrics?.conversions_value || 0);
                    return cost > 0 ? ((value / cost) * 100).toFixed(2) + '%' : '0%';
                })(),
                interactionRate: c.metrics?.interaction_rate ? (Number(c.metrics.interaction_rate) * 100).toFixed(2) + '%' : '0%',
                searchImpressionShare: c.metrics?.search_impression_share ? (Number(c.metrics.search_impression_share) * 100).toFixed(2) + '%' : '< 10%',
                cost: c.metrics?.cost_micros ? (Number(c.metrics.cost_micros) / 1000000).toFixed(2) : '0.00',
                ctr: c.metrics?.ctr ? (Number(c.metrics.ctr) * 100).toFixed(2) + '%' : '0%',
                cpa: c.metrics?.cost_per_conversion ? (Number(c.metrics.cost_per_conversion) / 1000000).toFixed(2) : '0.00'
            },
            adGroups: adGroups.map((ag: any) => {
                let agStatus = String(ag.ad_group.status);
                if (ag.ad_group.status === 2 || ag.ad_group.status === 'ENABLED') agStatus = 'ENABLED';
                if (ag.ad_group.status === 3 || ag.ad_group.status === 'PAUSED') agStatus = 'PAUSED';

                return {
                    id: ag.ad_group.id.toString(),
                    name: ag.ad_group.name,
                    status: agStatus,
                    metrics: {
                        impressions: ag.metrics?.impressions?.toString() || '0',
                        clicks: ag.metrics?.clicks?.toString() || '0',
                        conversions: ag.metrics?.conversions?.toString() || '0',
                        conversionsValue: ag.metrics?.conversions_value ? Number(ag.metrics.conversions_value).toFixed(2) : '0.00',
                        ctr: ag.metrics?.ctr ? (Number(ag.metrics.ctr) * 100).toFixed(2) + '%' : '0%',
                        cost: ag.metrics?.cost_micros ? (Number(ag.metrics.cost_micros) / 1000000).toFixed(2) : '0.00'
                    }
                }
            }),
            history: history.map((h: any) => ({
                date: h.segments?.date,
                impressions: Number(h.metrics?.impressions || 0),
                clicks: Number(h.metrics?.clicks || 0),
                cost: Number(h.metrics?.cost_micros || 0) / 1000000,
                conversions: Number(h.metrics?.conversions || 0),
                conversionsValue: Number(h.metrics?.conversions_value || 0)
            }))
        };
    } catch (error: any) {
        console.error('Failed to fetch detailed campaign:', error);
        throw new Error('Failed to fetch detailed campaign: ' + (error.message || JSON.stringify(error)));
    }
}