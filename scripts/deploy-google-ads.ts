import { enums, toMicros, getCustomer } from './lib/ads.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getTenant } from '../src/lib/server/tenants.ts';
import { getCampaign, markDeployed } from '../src/lib/server/campaigns.ts';

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
        console.error('Usage: bun scripts/deploy-google-ads.ts <path-to-campaign.json> <tenant_id> [customer_id]');
        process.exit(1);
    }

    const campaignPath = path.resolve(args[0]);
    const tenantId = args[1];
    const overrideCustomerId = args[2];

    const raw = JSON.parse(await fs.readFile(campaignPath, 'utf-8'));
    if (!raw.result || raw.result.platform !== 'google_search') {
        throw new Error('Invalid JSON: must be a Google Search Ads payload with result.platform = "google_search".');
    }
    const campaign: CampaignPayload = raw.result;

    if (campaign.status !== 'approved') {
        console.error(`Status is "${campaign.status}". Only approved campaigns can be deployed.`);
        process.exit(1);
    }

    // Resolve customer ID from SQLite tenant data
    let customerId = overrideCustomerId;
    let finalUrl: string | undefined;

    if (tenantId) {
        const tenant = getTenant(tenantId);
        if (tenant) {
            if (!customerId && tenant.google_ads_id) customerId = tenant.google_ads_id;
        }
    }

    finalUrl = process.env.FINAL_URL;

    if (!customerId) {
        console.error('Customer ID not found. Pass tenant_id as the second argument or customer_id as the third.');
        process.exit(1);
    }
    if (!finalUrl) {
        console.error('FINAL_URL env var not set. Add it before deploying (e.g., FINAL_URL=https://yoursite.com.br).');
        process.exit(1);
    }

    const cleanCustomerId = customerId.replace(/-/g, '');
    const customer = getCustomer(customerId);

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

    // Mark deployed in SQLite
    if (tenantId) {
        const slug = path.basename(campaignPath, '.json');
        const localCampaign = getCampaign(tenantId, slug);
        if (localCampaign) {
            markDeployed(localCampaign.id);
            console.log(`SQLite: campaign "${slug}" marked as deployed.`);
        }
    }

    console.log(`\nDone. All assets created as PAUSED. Enable them in Google Ads after review.`);
    console.log(`Campaign: ${campaignResourceName}`);
}

main().catch(err => {
    console.error('\nDeployment failed:', err.message || JSON.stringify(err));
    process.exit(1);
});
