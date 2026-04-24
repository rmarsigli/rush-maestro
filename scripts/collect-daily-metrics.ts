/**
 * Collect daily Google Ads metrics for a tenant.
 *
 * Usage:
 *   bun run scripts/collect-daily-metrics.ts <tenant> [YYYY-MM-DD]
 *
 * If date is omitted, defaults to yesterday.
 */

import { getCustomer, fromMicros } from './lib/ads.ts';
import { upsertDailyMetrics, type AdGroupMetrics, type AlertRecord } from '../src/lib/server/db/monitoring.ts';
import { insertAlert } from '../src/lib/server/db/alerts.ts';
import { logAgentRun } from '../src/lib/server/db/agent-runs.ts';
import { getTenant, type AdsMonitoringConfig } from '../src/lib/server/tenants.ts';

// ── Args ───────────────────────────────────────────────────────────────────

const [tenant, dateArg] = process.argv.slice(2);
if (!tenant) {
  console.error('Usage: bun run scripts/collect-daily-metrics.ts <tenant> [YYYY-MM-DD]');
  process.exit(1);
}

const date = dateArg ?? (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
})();

// ── Brand config ───────────────────────────────────────────────────────────

const DEFAULTS: AdsMonitoringConfig = {
  target_cpa_brl: 100,
  no_conversion_alert_days: 3,
  max_cpa_multiplier: 1.5,
  min_daily_impressions: 50,
  budget_underpace_threshold: 0.5,
};

const tenantData = getTenant(tenant);
if (!tenantData) {
  console.error(`[error] Tenant "${tenant}" not found in database`);
  process.exit(1);
}

if (!tenantData.google_ads_id) {
  console.error(`[error] No google_ads_id for tenant "${tenant}"`);
  process.exit(1);
}

const cfg: AdsMonitoringConfig = { ...DEFAULTS, ...(tenantData.ads_monitoring ?? {}) };
const customer = getCustomer(tenantData.google_ads_id);

// ── Queries ────────────────────────────────────────────────────────────────

console.log(`[${tenant}] Collecting metrics for ${date}...`);

const output: string[] = [];

try {
  // 1. All non-removed campaigns with budgets (no date filter → always returns rows)
  const campaignsRaw = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.serving_status,
      campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status != 'REMOVED'
  `);

  // 2. Metrics segmented by target date (may omit campaigns with zero activity)
  const metricsRaw = await customer.query(`
    SELECT
      campaign.id,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date = '${date}'
  `);

  const metricsById = new Map(
    metricsRaw.map(r => [String(r.campaign.id), r.metrics])
  );

  for (const camp of campaignsRaw) {
    const campaignId    = String(camp.campaign.id);
    const campaignName  = String(camp.campaign.name ?? campaignId);
    const budgetMicros  = Number(camp.campaign_budget?.amount_micros ?? 0);
    const campaignStatus = String(camp.campaign.status ?? 'UNKNOWN');
    const servingStatus  = String(camp.campaign.serving_status ?? 'UNKNOWN');

    // Day metrics — zero if campaign had no activity
    const m           = metricsById.get(campaignId);
    const impressions = Number(m?.impressions ?? 0);
    const clicks      = Number(m?.clicks ?? 0);
    const costMicros  = Number(m?.cost_micros ?? 0);
    const conversions = Number(m?.conversions ?? 0);

    // 3. Ad group breakdown for this campaign on this date
    const adGroupsRaw = await customer.query(`
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM ad_group
      WHERE campaign.id = ${campaignId}
        AND segments.date = '${date}'
    `);

    const adGroups: AdGroupMetrics[] = adGroupsRaw.map(ag => ({
      id:          String(ag.ad_group.id),
      name:        String(ag.ad_group.name ?? ''),
      impressions: Number(ag.metrics.impressions ?? 0),
      clicks:      Number(ag.metrics.clicks ?? 0),
      conversions: Number(ag.metrics.conversions ?? 0),
      cost_micros: Number(ag.metrics.cost_micros ?? 0),
      status:      String(ag.ad_group.status ?? ''),
    }));

    // 4. Last 7 days — for streak and trend context
    const historyRaw = await customer.query(`
      SELECT
        segments.date,
        campaign.status,
        campaign.serving_status,
        metrics.impressions,
        metrics.conversions
      FROM campaign
      WHERE campaign.id = ${campaignId}
        AND segments.date DURING LAST_7_DAYS
      ORDER BY segments.date DESC
    `);

    // ── Alert calculation ────────────────────────────────────────────────

    const alerts: AlertRecord[] = [];

    if (campaignStatus === 'ENABLED') {
      // Days where campaign was active (enabled + had impressions)
      const activeDays = historyRaw.filter(h =>
        String(h.campaign.status) === 'ENABLED' && Number(h.metrics.impressions) > 0
      );

      // 1. No-conversion streak
      let streak = 0;
      for (const day of activeDays) {
        if (Number(day.metrics.conversions) > 0) break;
        streak++;
      }
      if (streak >= cfg.no_conversion_alert_days) {
        alerts.push({
          level: streak >= cfg.no_conversion_alert_days * 2 ? 'CRITICAL' : 'WARN',
          type: 'no_conversions_streak',
          message: `${streak} dias consecutivos sem conversão`,
          action_suggested: 'Revisar keywords, landing page e bid strategy',
        });
      }

      // 2. High CPA (only meaningful when there are conversions today)
      if (conversions > 0) {
        const cpaBrl = fromMicros(costMicros) / conversions;
        if (cpaBrl > cfg.target_cpa_brl * cfg.max_cpa_multiplier) {
          const pct = ((cpaBrl / cfg.target_cpa_brl - 1) * 100).toFixed(0);
          alerts.push({
            level: 'WARN',
            type: 'high_cpa',
            message: `CPA R$${cpaBrl.toFixed(2)} — ${pct}% acima do target (R$${cfg.target_cpa_brl})`,
            action_suggested: 'Pausar ad groups com menor desempenho, revisar lances',
          });
        }
      }

      // 3. Budget underpace (only if campaign was actually showing)
      if (budgetMicros > 0 && impressions > 0) {
        const pace = costMicros / budgetMicros;
        if (pace < cfg.budget_underpace_threshold) {
          alerts.push({
            level: 'INFO',
            type: 'budget_underpace',
            message: `Budget: ${(pace * 100).toFixed(0)}% utilizado (threshold ${(cfg.budget_underpace_threshold * 100).toFixed(0)}%)`,
            action_suggested: 'Verificar lances, quality score e targeting',
          });
        }
      }

      // 4. Low impressions
      if (impressions > 0 && impressions < cfg.min_daily_impressions) {
        alerts.push({
          level: 'INFO',
          type: 'low_impressions',
          message: `${impressions} impressões — abaixo do mínimo (${cfg.min_daily_impressions})`,
          action_suggested: 'Aumentar budget ou lances, verificar impression share',
        });
      }
    }

    // ── Persist ──────────────────────────────────────────────────────────

    upsertDailyMetrics({
      tenant, campaign_id: campaignId, date,
      impressions, clicks, cost_micros: costMicros, conversions,
      budget_micros: budgetMicros, campaign_status: campaignStatus,
      serving_status: servingStatus, ad_groups: adGroups, alerts,
    });

    // WARN and CRITICAL go to alert_events (surfaced in the UI inbox)
    for (const alert of alerts) {
      if (alert.level !== 'INFO') {
        insertAlert({ tenant, campaign_id: campaignId, date, ...alert } as Parameters<typeof insertAlert>[0]);
      }
    }

    // ── Line summary ──────────────────────────────────────────────────────

    const costBrl = fromMicros(costMicros);
    const cpaBrl  = conversions > 0 ? `R$${(costBrl / conversions).toFixed(2)}` : 'N/A';
    const alertStr = alerts.length > 0
      ? `  ⚠ ${alerts.map(a => `[${a.level}] ${a.type}`).join(' | ')}`
      : '';

    const line =
      `  [${campaignStatus}] ${campaignName}\n` +
      `    imp: ${impressions} | cliques: ${clicks} | conv: ${conversions} | custo: R$${costBrl.toFixed(2)} | CPA: ${cpaBrl}` +
      alertStr;

    output.push(line);
    console.log(line);
  }

  logAgentRun({ agent: 'collect-daily-metrics', tenant, date, status: 'success', output: output.join('\n') });
  console.log(`\n[${tenant}] Done.`);

} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  logAgentRun({ agent: 'collect-daily-metrics', tenant, date, status: 'error', error: msg });
  console.error(`[error] ${msg}`);
  process.exit(1);
}
