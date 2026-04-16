# Getting Started

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Node.js 18+ (used by SvelteKit's Vite dev server for SSR)
- A Google Ads account with API access (developer token + OAuth credentials)
- Optional: Meta Business account for social publishing

## 1. Clone and install dependencies

```bash
git clone <repo-url>
cd marketing

# Root dependencies (better-sqlite3 for Node.js SSR, google-ads-api)
bun install

# UI dependencies
cd ui && bun install && cd ..
```

## 2. Configure environment variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env
```

Open `.env` and fill in:

### Google Ads API

You need a Google Cloud project with the Google Ads API enabled and an MCC (Manager) account or direct advertiser account.

| Variable | Where to find it |
|---|---|
| `GOOGLE_ADS_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client |
| `GOOGLE_ADS_CLIENT_SECRET` | Same OAuth 2.0 Client |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads → Tools → API Center |
| `GOOGLE_ADS_REFRESH_TOKEN` | Generated via OAuth flow (see below) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Your MCC account ID (without dashes), if using a manager account |

**Generating the refresh token:**

The simplest way is to use Google's OAuth Playground:

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon → check "Use your own OAuth credentials"
3. Enter your Client ID and Client Secret
4. In "Step 1", find and select the Google Ads API scope: `https://www.googleapis.com/auth/adwords`
5. Click "Authorize APIs" and complete the Google login
6. Click "Exchange authorization code for tokens"
7. Copy the `refresh_token` value into your `.env`

### Meta Graph API (optional — only for social publishing)

| Variable | Where to find it |
|---|---|
| `META_PAGE_ACCESS_TOKEN` | Meta Business Suite → Settings → Advanced → Page Access Token |
| `META_PAGE_ID` | Your Facebook Page ID |
| `META_INSTAGRAM_ACCOUNT_ID` | Instagram Business Account ID (linked to the Page) |
| `MEDIA_PUBLIC_BASE_URL` | Public URL for your local server (use [ngrok](https://ngrok.com) for development) |

The `MEDIA_PUBLIC_BASE_URL` is required because Instagram requires a publicly accessible URL for media files. In development, run `ngrok http 5173` and set the value to the HTTPS ngrok URL.

## 3. Test the Google Ads connection

```bash
bun run scripts/test-ads-connection.ts <your-customer-id>
```

Customer ID format: with or without dashes (e.g. `123-456-7890` or `1234567890`).

If successful, you'll see account info printed to the console.

## 4. Create your first client

Create the directory structure manually or use Claude Code to scaffold it:

```bash
mkdir -p clients/my-client/posts
mkdir -p clients/my-client/ads/google
mkdir -p clients/my-client/reports
```

Create `clients/my-client/brand.json`:

```json
{
  "name": "My Client",
  "niche": "e.g. home renovation",
  "website_url": "https://myclient.com.br",
  "google_ads_id": "123-456-7890",
  "ads_monitoring": {
    "target_cpa_brl": 150,
    "no_conversion_alert_days": 3,
    "max_cpa_multiplier": 1.5,
    "min_daily_impressions": 50,
    "budget_underpace_threshold": 0.5
  }
}
```

> **Important:** `clients/` is gitignored. Client data (brand config, posts, campaigns, reports) is never committed.

## 5. Start the UI

```bash
cd ui
bun dev
```

Open `http://localhost:5173` to see the client list. Navigate to `http://localhost:5173/my-client` to access the tenant dashboard.

## 6. Set up daily monitoring

After verifying the Google Ads connection works, add a crontab entry to collect metrics automatically:

```bash
crontab -e
```

```
3 7 * * * cd /absolute/path/to/marketing && bun run scripts/collect-daily-metrics.ts my-client >> /tmp/ads-monitor.log 2>&1
```

Run it manually for the first time to verify it works and seed the database:

```bash
bun run scripts/collect-daily-metrics.ts my-client
```

The SQLite database is created automatically at `db/marketing.db` on first run.

## 7. Configure Claude Code agents (optional)

The `.claude/agents/` directory contains agent persona definitions. These are automatically picked up by Claude Code as sub-agents when you work in this project.

Agents available:
- `social-media-copy-creator` — generates post JSON
- `google-ads-creator` — builds campaign JSON
- `monitoring` — interprets daily metrics and alerts
- `weekly-report` — generates weekly performance reports

No configuration needed — Claude Code discovers them from the directory.

## Directory layout after setup

```
marketing/
├── .env                      # Your credentials (never committed)
├── db/marketing.db           # Auto-created SQLite database (gitignored)
└── clients/
    └── my-client/            # gitignored
        ├── brand.json
        ├── posts/
        ├── ads/google/
        └── reports/
```

## Troubleshooting

**`bun:sqlite` error in the UI**

The UI runs via Vite which uses Node.js for SSR. `bun:sqlite` is a Bun-only module. The DB layer auto-detects the runtime and uses `better-sqlite3` in Node.js. If you see this error, make sure root dependencies are installed (`bun install` at root).

**Google Ads API `PERMISSION_DENIED`**

Your developer token may be in test mode. Test mode only allows access to test accounts. Apply for basic access in Google Ads → Tools → API Center.

**Meta publishing fails with media error**

Instagram requires the media file to be publicly accessible. Set `MEDIA_PUBLIC_BASE_URL` to a valid public HTTPS URL (use ngrok in development).
