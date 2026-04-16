/**
 * Google Ads API — shared client factory.
 *
 * Bun auto-injects .env — no dotenv needed.
 * Re-exports enums and toMicros so scripts only need one import.
 *
 * Usage:
 *   import { ads, enums, micros, fromMicros } from './lib/ads.ts'
 *   const campaigns = await ads.portico.query(`SELECT ...`)
 */

import { GoogleAdsApi, enums, toMicros } from 'google-ads-api';

export { enums, toMicros };

const _client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
});

/**
 * Map your client slugs to their Google Ads customer IDs.
 * IDs come from clients/[tenant]/brand.json → google_ads_id.
 * Example:
 *   acme: '123-456-7890',
 */
export const CLIENTS: Record<string, string> = {};

export type ClientName = keyof typeof CLIENTS;

/** Returns a configured Customer for any account ID. */
export function getCustomer(customerId: string) {
  const loginId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '');
  return _client.Customer({
    customer_id: customerId.replace(/-/g, ''),
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
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
