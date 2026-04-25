/**
 * Google Ads API — shared client factory.
 *
 * Credentials are stored in the SQLite `integrations` table (provider = 'google_ads').
 * Falls back to .env vars if the DB row is missing (useful for CI/scripts without DB).
 *
 * Usage:
 *   import { getCustomer, enums, micros, fromMicros } from './lib/ads.ts'
 *   const customer = getCustomer('795-509-5597')
 *   const rows = await customer.query(`SELECT ...`)
 */

import { GoogleAdsApi, enums, toMicros } from 'google-ads-api';
import { getDb } from '../../src/lib/server/db/index.ts';

export { enums, toMicros };

function loadCredentials() {
  try {
    const row = getDb()
      .prepare('SELECT oauth_client_id, oauth_client_secret, developer_token, login_customer_id, refresh_token FROM integrations WHERE provider = ? AND status = ?')
      .get('google_ads', 'connected') as any;
    if (row?.oauth_client_id && row?.refresh_token) return row;
  } catch {
    // DB not available — fall through to .env
  }

  return {
    oauth_client_id:     process.env.GOOGLE_ADS_CLIENT_ID,
    oauth_client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    developer_token:     process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    login_customer_id:   process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    refresh_token:       process.env.GOOGLE_ADS_REFRESH_TOKEN,
  };
}

const creds = loadCredentials();

const _client = new GoogleAdsApi({
  client_id:       creds.oauth_client_id!,
  client_secret:   creds.oauth_client_secret!,
  developer_token: creds.developer_token!,
});

/**
 * Map your client slugs to their Google Ads customer IDs.
 * IDs come from SQLite → tenants.google_ads_id.
 */
export const CLIENTS: Record<string, string> = {};

export type ClientName = keyof typeof CLIENTS;

/** Returns a configured Customer for any account ID. */
export function getCustomer(customerId: string) {
  const loginId = creds.login_customer_id?.replace(/-/g, '');
  return _client.Customer({
    customer_id:  customerId.replace(/-/g, ''),
    refresh_token: creds.refresh_token!,
    ...(loginId ? { login_customer_id: loginId } : {}),
  });
}

/** Pre-built customers for all entries in CLIENTS. */
export const ads = Object.fromEntries(
  Object.entries(CLIENTS).map(([name, id]) => [name, getCustomer(id)])
) as Record<ClientName, ReturnType<typeof getCustomer>>;

/** R$ → micros */
export const micros = (brl: number) => brl * 1_000_000;

/** micros → R$ */
export const fromMicros = (m: number | bigint) => Number(m) / 1_000_000;
