import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getTenant } from '$lib/server/tenants.js'
import { getLiveCampaigns } from '$lib/server/googleAds.js'
import { getAdsCustomer, enums, micros, fromMicros } from '$lib/server/googleAdsClient.js'

function ok(data: unknown) {
	return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}
function err(msg: string) {
	return { content: [{ type: 'text' as const, text: msg }], isError: true as const }
}

function getCustomer(tenantId: string, campaignId?: string) {
	const tenant = getTenant(tenantId)
	if (!tenant) throw new Error(`Tenant "${tenantId}" not found`)
	const customerId = tenant.google_ads_id
	if (!customerId) throw new Error(`Tenant "${tenantId}" has no google_ads_id`)
	return { customer: getAdsCustomer(tenantId, customerId), customerId, tenant }
}

// ── helpers ───────────────────────────────────────────────────────────────────

const MATCH_TYPE: Record<string, number> = {
	broad:   enums.KeywordMatchType.BROAD,
	phrase:  enums.KeywordMatchType.PHRASE,
	exact:   enums.KeywordMatchType.EXACT,
}

export function registerAdsTools(server: McpServer): void {

	// ── READ ──────────────────────────────────────────────────────────────────

	server.registerTool('get_live_metrics', {
		description: 'Query live campaign metrics from Google Ads API',
		inputSchema: { tenant_id: z.string() }
	}, async ({ tenant_id }) => {
		const tenant = getTenant(tenant_id)
		if (!tenant) return err(`Tenant "${tenant_id}" not found`)
		const campaigns = await getLiveCampaigns(tenant.google_ads_id ?? undefined, tenant_id)
		return ok(campaigns)
	})

	server.registerTool('get_campaign_criteria', {
		description: 'List criteria for a campaign: negative keywords, ad schedule, location targets, device bids',
		inputSchema: { tenant_id: z.string(), campaign_id: z.string() }
	}, async ({ tenant_id, campaign_id }) => {
		try {
			const { customer } = getCustomer(tenant_id)
			const rows = await customer.query(`
				SELECT
					campaign_criterion.criterion_id,
					campaign_criterion.type,
					campaign_criterion.negative,
					campaign_criterion.bid_modifier,
					campaign_criterion.keyword.text,
					campaign_criterion.keyword.match_type,
					campaign_criterion.ad_schedule.day_of_week,
					campaign_criterion.ad_schedule.start_hour,
					campaign_criterion.ad_schedule.end_hour,
					campaign_criterion.location.geo_target_constant,
					campaign_criterion.device.type
				FROM campaign_criterion
				WHERE campaign.id = ${campaign_id}
			`)
			return ok(rows.map((r: any) => r.campaign_criterion))
		} catch (e: any) {
			return err(e.message)
		}
	})

	server.registerTool('get_search_terms', {
		description: 'Search terms report for a campaign. Shows what users actually searched to trigger ads.',
		inputSchema: {
			tenant_id:   z.string(),
			campaign_id: z.string(),
			days:        z.number().int().min(1).max(90).default(30),
		}
	}, async ({ tenant_id, campaign_id, days }) => {
		try {
			const { customer } = getCustomer(tenant_id)
			const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10).replace(/-/g, '')
			const rows = await customer.query(`
				SELECT
					search_term_view.search_term,
					search_term_view.status,
					metrics.impressions,
					metrics.clicks,
					metrics.cost_micros,
					metrics.conversions
				FROM search_term_view
				WHERE campaign.id = ${campaign_id}
				  AND segments.date >= "${since}"
				ORDER BY metrics.impressions DESC
				LIMIT 100
			`)
			return ok(rows.map((r: any) => ({
				term:        r.search_term_view.search_term,
				status:      r.search_term_view.status,
				impressions: r.metrics.impressions,
				clicks:      r.metrics.clicks,
				cost:        fromMicros(r.metrics.cost_micros ?? 0).toFixed(2),
				conversions: r.metrics.conversions,
			})))
		} catch (e: any) {
			return err(e.message)
		}
	})

	server.registerTool('get_ad_groups', {
		description: 'List ad groups for a campaign with impression/click/cost metrics',
		inputSchema: {
			tenant_id:   z.string(),
			campaign_id: z.string(),
			days:        z.number().int().min(1).max(90).default(30),
		}
	}, async ({ tenant_id, campaign_id, days }) => {
		try {
			const { customer } = getCustomer(tenant_id)
			const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10).replace(/-/g, '')
			const rows = await customer.query(`
				SELECT
					ad_group.id,
					ad_group.name,
					ad_group.status,
					ad_group.resource_name,
					metrics.impressions,
					metrics.clicks,
					metrics.cost_micros,
					metrics.conversions
				FROM ad_group
				WHERE campaign.id = ${campaign_id}
				  AND segments.date >= "${since}"
				ORDER BY metrics.impressions DESC
			`)
			return ok(rows.map((r: any) => ({
				id:           r.ad_group.id?.toString(),
				name:         r.ad_group.name,
				status:       r.ad_group.status,
				resource_name: r.ad_group.resource_name,
				impressions:  r.metrics.impressions,
				clicks:       r.metrics.clicks,
				cost:         fromMicros(r.metrics.cost_micros ?? 0).toFixed(2),
				conversions:  r.metrics.conversions,
			})))
		} catch (e: any) {
			return err(e.message)
		}
	})

	// ── WRITE ─────────────────────────────────────────────────────────────────

	server.registerTool('add_negative_keywords', {
		description: 'Add negative keywords at campaign level. Use BROAD match to block all variations.',
		inputSchema: {
			tenant_id:   z.string(),
			campaign_id: z.string(),
			keywords:    z.array(z.string()).min(1),
			match_type:  z.enum(['broad', 'phrase', 'exact']).default('broad'),
		}
	}, async ({ tenant_id, campaign_id, keywords, match_type }) => {
		try {
			const { customer, customerId } = getCustomer(tenant_id)
			const campaignRn = `customers/${customerId.replace(/-/g, '')}/campaigns/${campaign_id}`
			const matchEnum = MATCH_TYPE[match_type]

			const result = await customer.mutateResources(
				keywords.map((text) => ({
					entity:    'campaign_criterion' as const,
					operation: 'create' as const,
					resource: {
						campaign: campaignRn,
						negative: true,
						keyword: { text, match_type: matchEnum },
					},
				}))
			)
			return ok({ added: result.mutate_operation_responses.length, keywords })
		} catch (e: any) {
			return err(e.message)
		}
	})

	server.registerTool('update_campaign_budget', {
		description: 'Update the daily budget of a campaign (in BRL). Requires budget_id from the campaign.',
		inputSchema: {
			tenant_id:  z.string(),
			budget_id:  z.string(),
			amount_brl: z.number().positive(),
		}
	}, async ({ tenant_id, budget_id, amount_brl }) => {
		try {
			const { customer, customerId } = getCustomer(tenant_id)
			await customer.mutateResources([{
				entity:    'campaign_budget' as const,
				operation: 'update' as const,
				resource: {
					resource_name: `customers/${customerId.replace(/-/g, '')}/campaignBudgets/${budget_id}`,
					amount_micros: micros(amount_brl),
				},
			} as any])
			return ok({ budget_id, amount_brl, amount_micros: micros(amount_brl) })
		} catch (e: any) {
			return err(e.message)
		}
	})

	server.registerTool('set_weekday_schedule', {
		description: 'Add Mon–Fri ad schedule criteria to a campaign so ads do not serve on Sat/Sun. Safe to call on campaigns with no existing schedule.',
		inputSchema: {
			tenant_id:   z.string(),
			campaign_id: z.string(),
		}
	}, async ({ tenant_id, campaign_id }) => {
		try {
			const { customer, customerId } = getCustomer(tenant_id)
			const campaignRn = `customers/${customerId.replace(/-/g, '')}/campaigns/${campaign_id}`

			const weekdays = [
				enums.DayOfWeek.MONDAY,
				enums.DayOfWeek.TUESDAY,
				enums.DayOfWeek.WEDNESDAY,
				enums.DayOfWeek.THURSDAY,
				enums.DayOfWeek.FRIDAY,
			]

			const result = await customer.mutateResources(
				weekdays.map((day) => ({
					entity:    'campaign_criterion' as const,
					operation: 'create' as const,
					resource: {
						campaign: campaignRn,
						ad_schedule: {
							day_of_week:  day,
							start_hour:   0,
							start_minute: enums.MinuteOfHour.ZERO,
							end_hour:     24,
							end_minute:   enums.MinuteOfHour.ZERO,
						},
					},
				}))
			)
			return ok({ criteria_added: result.mutate_operation_responses.length, schedule: 'Mon–Fri 00:00–24:00' })
		} catch (e: any) {
			return err(e.message)
		}
	})

	server.registerTool('add_ad_group_keywords', {
		description: 'Add keywords to a specific ad group. Use ad_group_resource_name from get_ad_groups.',
		inputSchema: {
			tenant_id:             z.string(),
			ad_group_resource_name: z.string(),
			keywords: z.array(z.object({
				text:       z.string(),
				match_type: z.enum(['broad', 'phrase', 'exact']).default('phrase'),
			})).min(1),
		}
	}, async ({ tenant_id, ad_group_resource_name, keywords }) => {
		try {
			const { customer } = getCustomer(tenant_id)

			const result = await customer.mutateResources(
				keywords.map(({ text, match_type }) => ({
					entity:    'ad_group_criterion' as const,
					operation: 'create' as const,
					resource: {
						ad_group: ad_group_resource_name,
						status:   enums.AdGroupCriterionStatus.ENABLED,
						keyword: { text, match_type: MATCH_TYPE[match_type] },
					},
				}))
			)
			return ok({ added: result.mutate_operation_responses.length })
		} catch (e: any) {
			return err(e.message)
		}
	})

	server.registerTool('add_campaign_extensions', {
		description: 'Add callout and/or sitelink extensions to a campaign. Callout max 25 chars. Sitelink desc max 35 chars.',
		inputSchema: {
			tenant_id:   z.string(),
			campaign_id: z.string(),
			callouts: z.array(z.string().max(25)).default([]),
			sitelinks: z.array(z.object({
				text:  z.string().max(25),
				desc1: z.string().max(35),
				desc2: z.string().max(35),
				url:   z.string().url(),
			})).default([]),
		}
	}, async ({ tenant_id, campaign_id, callouts, sitelinks }) => {
		if (callouts.length === 0 && sitelinks.length === 0) return err('Provide at least one callout or sitelink')
		try {
			const { customer, customerId } = getCustomer(tenant_id)
			const campaignRn = `customers/${customerId.replace(/-/g, '')}/campaigns/${campaign_id}`

			// Step 1: create assets
			const assetOps = [
				...callouts.map((text) => ({
					entity:    'asset' as const,
					operation: 'create' as const,
					resource: { callout_asset: { callout_text: text } },
				})),
				...sitelinks.map(({ text, desc1, desc2, url }) => ({
					entity:    'asset' as const,
					operation: 'create' as const,
					resource: {
						final_urls:    [url],
						sitelink_asset: { link_text: text, description1: desc1, description2: desc2 },
					},
				})),
			]

			const assetResult = await customer.mutateResources(assetOps as any)
			const assetRns: string[] = assetResult.mutate_operation_responses
				.map((r: any) => r.asset_result?.resource_name as string)
				.filter(Boolean)

			if (assetRns.length === 0) return err('Asset creation returned no resource names')

			// Step 2: link to campaign
			const linkOps = [
				...assetRns.slice(0, callouts.length).map((rn) => ({
					entity:    'campaign_asset' as const,
					operation: 'create' as const,
					resource: { campaign: campaignRn, asset: rn, field_type: enums.AssetFieldType.CALLOUT },
				})),
				...assetRns.slice(callouts.length).map((rn) => ({
					entity:    'campaign_asset' as const,
					operation: 'create' as const,
					resource: { campaign: campaignRn, asset: rn, field_type: enums.AssetFieldType.SITELINK },
				})),
			]

			const linkResult = await customer.mutateResources(linkOps)
			return ok({
				assets_created: assetRns.length,
				assets_linked:  linkResult.mutate_operation_responses.length,
				callouts,
				sitelinks: sitelinks.map((s) => s.text),
			})
		} catch (e: any) {
			return err(e.message)
		}
	})

	server.registerTool('set_campaign_status', {
		description: 'Pause or enable a campaign. status must be "ENABLED" or "PAUSED".',
		inputSchema: {
			tenant_id:   z.string(),
			campaign_id: z.string(),
			status:      z.enum(['ENABLED', 'PAUSED']),
		}
	}, async ({ tenant_id, campaign_id, status }) => {
		try {
			const { customer, customerId } = getCustomer(tenant_id)
			await customer.mutateResources([{
				entity:    'campaign' as const,
				operation: 'update' as const,
				resource: {
					resource_name: `customers/${customerId.replace(/-/g, '')}/campaigns/${campaign_id}`,
					status: status === 'ENABLED' ? enums.CampaignStatus.ENABLED : enums.CampaignStatus.PAUSED,
				},
			} as any])
			return ok({ campaign_id, status })
		} catch (e: any) {
			return err(e.message)
		}
	})
}
