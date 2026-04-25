// UI-facing types used by Svelte components.
// Data is now sourced from SQLite via src/lib/server/{posts,campaigns,tenants}.ts
// and shaped by +page.server.ts loaders to match these types.

export type PostStatus = 'draft' | 'approved' | 'scheduled' | 'published';
export type PostPlatform = 'instagram_feed' | 'instagram_stories' | 'instagram_reels' | 'linkedin' | 'facebook';

export interface Post {
	id: string;
	status: PostStatus;
	title: string;
	content: string;
	hashtags: string[];
	media_type: string;
	scheduled_date?: string;
	scheduled_time?: string;
	platform: PostPlatform[];
}

export interface PostWithMeta extends Post {
	client_id: string;
	filename: string;
	media_files: string[];
	workflow: Record<string, unknown>;
}

export interface GoogleAdCampaign {
	id: string;
	status: 'draft' | 'approved' | 'published';
	platform: 'google_search';
	objective: string;
	budget_suggestion: string;
	ad_groups: unknown[];
}

export interface GoogleAdCampaignWithMeta extends GoogleAdCampaign {
	client_id: string;
	filename: string;
	workflow: Record<string, unknown>;
}
