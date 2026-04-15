---
name: deploy-google-ads
description: Deploys an approved Google Ads campaign from a local JSON draft to the live Google Ads API.
---
# Deploy Google Ads Workflow

## Important Notes

- **Status check:** Only campaigns with `status: "approved"` can be deployed. Never deploy drafts.
- **Budget parsing:** The `budget_suggestion` field is a human-readable string (e.g., `"R$50/dia"`). Extract the numeric value before sending to the API. The API expects `amount_micros` (value × 1,000,000). Always upload the budget as `PAUSED` initially.
- **Mutation order:** The API requires sequential creation — Budget → Campaign → Ad Groups → Ads. Each step depends on the resource name returned by the previous one.
- **Script safety:** Delete the temporary script only on success. On failure, preserve it for debugging and report the full error to the user.

## Steps

When the user asks to deploy, launch, or push a specific Google Ads campaign:

1. Identify the `client_id` and the `campaign_id` (the JSON filename).
2. Verify that the campaign status is `approved` in `clients/<client_id>/ads/google/<campaign_id>.json`. If not, warn the user and stop.
3. Read `clients/<client_id>/brand.json` to extract `google_ads_id`. If missing, ask the user for the Google Ads Customer ID.
4. Inform the user what will be deployed (campaign ID, ad groups count, budget).
5. Create a temporary deployment script in the `ui` folder that imports `google-ads-api` and executes the following `MutateOperations` in order:
   - Create a `CampaignBudget` (amount in micros, delivery method `STANDARD`)
   - Create a `Campaign` with `status: PAUSED`, linking it to the budget
   - For each ad group: create an `AdGroup` with `status: PAUSED`
   - For each ad group: create an `AdGroupAd` with the `responsive_search_ad` headlines and descriptions, `final_urls` from `brand.json` (or ask if missing)
6. Execute the script using `bun run`.
7. On success, update the local JSON `status` from `approved` to `published` and delete the temporary script.
8. On failure, preserve the temporary script and report the full API error message to the user.
