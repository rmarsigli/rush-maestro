import fs from 'node:fs/promises';
import path from 'node:path';

const CLIENTS_DIR = path.resolve('../clients');

function draftFirst<T extends { id: string; status: string }>(a: T, b: T): number {
  if (a.status === 'draft' && b.status !== 'draft') return -1;
  if (a.status !== 'draft' && b.status === 'draft') return 1;
  return b.id.localeCompare(a.id);
}

export interface AdsMonitoring {
  target_cpa_brl: number;
  no_conversion_alert_days: number;
  max_cpa_multiplier: number;
  min_daily_impressions: number;
  budget_underpace_threshold: number;
}

export interface Brand {
  name: string;
  niche: string;
  google_ads_id?: string;
  ads_monitoring?: Partial<AdsMonitoring>;
}

export type PostStatus = 'draft' | 'approved' | 'scheduled' | 'published';
export type PostPlatform = 'instagram_feed' | 'instagram_stories' | 'instagram_reels' | 'linkedin' | 'facebook';

export interface Post {
  id: string;
  status: PostStatus;
  title: string;
  content: string;
  hashtags: string[];
  media_type: string;
  scheduled_date?: string;   // YYYY-MM-DD
  scheduled_time?: string;   // HH:MM
  platform?: PostPlatform;
}

export interface PostWithMeta extends Post {
  client_id: string;
  filename: string;
  media_files: string[];
  workflow: Record<string, unknown>;
}

export async function getClients(): Promise<{ id: string; brand: Brand }[]> {
  try {
    const entries = await fs.readdir(CLIENTS_DIR, { withFileTypes: true });
    const clients = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const brandData = await fs.readFile(
            path.join(CLIENTS_DIR, entry.name, 'brand.json'),
            'utf-8'
          );
          clients.push({ id: entry.name, brand: JSON.parse(brandData) });
        } catch (e) {
          // brand.json might not exist yet
          clients.push({ id: entry.name, brand: { name: entry.name, niche: 'unknown' } });
        }
      }
    }
    return clients;
  } catch (e) {
    return [];
  }
}

export async function getClientPosts(clientId: string): Promise<PostWithMeta[]> {
  const postsDir = path.join(CLIENTS_DIR, clientId, 'posts');
  try {
    const entries = await fs.readdir(postsDir, { withFileTypes: true });
    const posts: PostWithMeta[] = [];

    const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.json'));
    const allFiles = entries.map(e => e.name);

    for (const file of jsonFiles) {
      const data = await fs.readFile(path.join(postsDir, file.name), 'utf-8');
      const parsed = JSON.parse(data);
      
      // Look for media files with same prefix
      const prefix = file.name.replace('.json', '');
      const mediaFiles = allFiles
        .filter(f => f !== file.name && (f.startsWith(prefix + '.') || f.startsWith(prefix + '-')))
        .sort((a, b) => a.localeCompare(b));

      if (parsed.result) {
        posts.push({
          ...parsed.result,
          client_id: clientId,
          filename: file.name,
          media_files: mediaFiles,
          workflow: parsed.workflow
        });
      }
    }
    
    return posts.sort(draftFirst);
  } catch (e) {
    return [];
  }
}


export interface GoogleAdGroup {
  name: string;
  keywords: string[];
  negative_keywords: string[];
  responsive_search_ad: {
    headlines: string[];
    descriptions: string[];
    sitelinks?: string[];
  };
}

export interface GoogleAdCampaign {
  id: string;
  status: 'draft' | 'approved' | 'published';
  platform: 'google_search';
  objective: string;
  budget_suggestion: string;
  ad_groups: GoogleAdGroup[];
}

export interface GoogleAdCampaignWithMeta extends GoogleAdCampaign {
  client_id: string;
  filename: string;
  workflow: Record<string, unknown>;
}

export async function getClientGoogleAds(clientId: string): Promise<GoogleAdCampaignWithMeta[]> {
  const adsDir = path.join(CLIENTS_DIR, clientId, 'ads', 'google');
  try {
    const entries = await fs.readdir(adsDir, { withFileTypes: true });
    const campaigns: GoogleAdCampaignWithMeta[] = [];

    const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.json'));

    for (const file of jsonFiles) {
      const data = await fs.readFile(path.join(adsDir, file.name), 'utf-8');
      const parsed = JSON.parse(data);

      if (parsed.result && parsed.result.platform === 'google_search') {
        campaigns.push({
          ...parsed.result,
          client_id: clientId,
          filename: file.name,
          workflow: parsed.workflow
        });
      }
    }
    
    return campaigns.sort(draftFirst);
  } catch (e) {
    return [];
  }
}
