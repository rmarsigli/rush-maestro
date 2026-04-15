import { GoogleAdsApi, enums, toMicros } from 'google-ads-api';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

interface AdGroup {
    name: string;
    keywords: string[];
    negative_keywords: string[];
    responsive_search_ad: {
        headlines: string[];
        descriptions: string[];
    };
}

interface CampaignPayload {
    id: string;
    status: string;
    platform: string;
    objective: string;
    budget_suggestion: string;
    ad_groups: AdGroup[];
}

function parseBudget(budgetStr: string): number {
    const match = budgetStr.match(/[\d]+(?:[.,]\d+)?/);
    if (!match) throw new Error(`Cannot parse budget from: "${budgetStr}"`);
    return parseFloat(match[0].replace(',', '.'));
}

function parseKeyword(raw: string): { text: string; matchType: number } {
    let text = raw.trim();
    let matchType = enums.KeywordMatchType.BROAD;
    if (text.startsWith('[') && text.endsWith(']')) {
        text = text.slice(1, -1).trim();
        matchType = enums.KeywordMatchType.EXACT;
    } else if (text.startsWith('"') && text.endsWith('"')) {
        text = text.slice(1, -1).trim();
        matchType = enums.KeywordMatchType.PHRASE;
    }
    return { text, matchType };
}

async function main() {
    const args = process.argv.slice(2);
    if (!args[0]) {
        console.error('Usage: bun scripts/deploy-google-ads.ts <path-to-campaign.json> [customer_id]');
        process.exit(1);
    }

    const campaignPath = path.resolve(args[0]);
    const overrideCustomerId = args[1];

    const raw = JSON.parse(await fs.readFile(campaignPath, 'utf-8'));
    if (!raw.result || raw.result.platform !== 'google_search') {
        throw new Error('Invalid JSON: must be a Google Search Ads payload with result.platform = "google_search".');
    }
    const campaign: CampaignPayload = raw.result;

    if (campaign.status !== 'approved') {
        console.error(`Status is "${campaign.status}". Only approved campaigns can be deployed.`);
        process.exit(1);
    }

    // Resolve customer ID and final URL from brand.json
    const pathParts = campaignPath.split(path.sep);
    const clientsIdx = pathParts.findIndex(p => p === 'clients');
    const clientId = clientsIdx !== -1 ? pathParts[clientsIdx + 1] : null;

    let customerId = overrideCustomerId;
    let finalUrl: string | undefined;

    if (clientId) {
        try {
            const brand = JSON.parse(await fs.readFile(path.resolve(`clients/${clientId}/brand.json`), 'utf-8'));
            if (!customerId && brand.google_ads_id) customerId = brand.google_ads_id;
            finalUrl = brand.website_url;
        } catch { /* brand.json not found */ }
    }

    if (!customerId) {
        console.error('Customer ID not found. Add google_ads_id to brand.json or pass it as the second argument.');
        process.exit(1);
    }
    if (!finalUrl) {
        console.error('website_url not found in brand.json. Add it before deploying (e.g., "https://yoursite.com.br").');
        process.exit(1);
    }

    const clientId_env = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '');
    const cleanCustomerId = customerId.replace(/-/g, '');

    if (!clientId_env || !clientSecret || !developerToken || !refreshToken) {
        console.error('Missing Google Ads credentials in .env');
        process.exit(1);
    }

    const ads = new GoogleAdsApi({
        client_id: clientId_env,
        client_secret: clientSecret,
        developer_token: developerToken,
    });

    const customer = ads.Customer({
        customer_id: cleanCustomerId,
        login_customer_id: loginCustomerId,
        refresh_token: refreshToken,
    });

    console.log(`\nDeploying "${campaign.id}" to customer ${cleanCustomerId}...`);
    console.log(`Budget: ${campaign.budget_suggestion} | Ad Groups: ${campaign.ad_groups.length} | URL: ${finalUrl}\n`);

    // Step 1: Create Campaign Budget
    const budgetAmount = parseBudget(campaign.budget_suggestion);
    const budgetRes = await customer.campaignBudgets.create([{
        name: `Budget - ${campaign.id} - ${Date.now()}`,
        delivery_method: enums.BudgetDeliveryMethod.STANDARD,
        amount_micros: toMicros(budgetAmount),
        explicitly_shared: false,
    }]);
    const budgetResourceName = (budgetRes.results[0] as any).resource_name as string;
    console.log(`[1/4] Budget created (${budgetAmount}/day): ${budgetResourceName}`);

    // Step 2: Create Campaign (always PAUSED — review before enabling)
    const campaignRes = await customer.campaigns.create([{
        name: campaign.id,
        status: enums.CampaignStatus.PAUSED,
        advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
        campaign_budget: budgetResourceName,
        manual_cpc: { enhanced_cpc_enabled: false },
        network_settings: {
            target_google_search: true,
            target_search_network: true,
            target_content_network: false,
        },
    }]);
    const campaignResourceName = (campaignRes.results[0] as any).resource_name as string;
    console.log(`[2/4] Campaign created: ${campaignResourceName}`);

    // Steps 3 & 4: Ad Groups, Keywords, and RSAs
    for (const group of campaign.ad_groups) {
        const adGroupRes = await customer.adGroups.create([{
            name: group.name,
            campaign: campaignResourceName,
            status: enums.AdGroupStatus.PAUSED,
            type: enums.AdGroupType.SEARCH_STANDARD,
        }]);
        const adGroupResourceName = (adGroupRes.results[0] as any).resource_name as string;
        console.log(`[3/4] Ad Group "${group.name}": ${adGroupResourceName}`);

        if (group.keywords.length > 0) {
            const kwCriteria = group.keywords.map(raw => {
                const { text, matchType } = parseKeyword(raw);
                return {
                    ad_group: adGroupResourceName,
                    status: enums.AdGroupCriterionStatus.ENABLED,
                    keyword: { text, match_type: matchType },
                };
            });
            await customer.adGroupCriteria.create(kwCriteria);
            console.log(`       + ${group.keywords.length} keywords`);
        }

        if (group.negative_keywords.length > 0) {
            const negCriteria = group.negative_keywords.map(kw => ({
                ad_group: adGroupResourceName,
                negative: true,
                keyword: { text: kw.trim(), match_type: enums.KeywordMatchType.BROAD },
            }));
            await customer.adGroupCriteria.create(negCriteria);
            console.log(`       + ${group.negative_keywords.length} negative keywords`);
        }

        await customer.adGroupAds.create([{
            ad_group: adGroupResourceName,
            status: enums.AdGroupAdStatus.PAUSED,
            ad: {
                final_urls: [finalUrl!],
                responsive_search_ad: {
                    headlines: group.responsive_search_ad.headlines.map(text => ({ text })),
                    descriptions: group.responsive_search_ad.descriptions.map(text => ({ text })),
                },
            },
        }]);
        console.log(`[4/4] RSA created for "${group.name}"`);
    }

    // Mark local JSON as published
    raw.result.status = 'published';
    await fs.writeFile(campaignPath, JSON.stringify(raw, null, 4), 'utf-8');

    console.log(`\nDone. Campaign deployed and local status updated to "published".`);
    console.log(`All assets created as PAUSED. Enable them in Google Ads after review.`);
    console.log(`Campaign: ${campaignResourceName}`);
}

main().catch(err => {
    console.error('\nDeployment failed:', err.message || JSON.stringify(err));
    process.exit(1);
});
