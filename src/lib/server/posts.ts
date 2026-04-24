import { getDb } from './db/index.ts';

export type PostStatus = 'draft' | 'approved' | 'published' | 'scheduled';
export type MediaType = 'carousel' | 'image' | 'video' | 'reel';

export interface PostWorkflow {
	strategy?: { framework: string; reasoning: string };
	clarity?: { changes: string };
	impact?: { changes: string };
	[key: string]: unknown;
}

export interface Post {
	id: string;
	tenant_id: string;
	status: PostStatus;
	title: string | null;
	content: string;
	hashtags: string[];
	media_type: MediaType | null;
	workflow: PostWorkflow | null;
	media_path: string | null;
	scheduled_date: string | null;
	scheduled_time: string | null;
	published_at: string | null;
	created_at: string;
	updated_at: string;
}

interface PostRow {
	id: string;
	tenant_id: string;
	status: string;
	title: string | null;
	content: string;
	hashtags: string | null;
	media_type: string | null;
	workflow: string | null;
	media_path: string | null;
	scheduled_date: string | null;
	scheduled_time: string | null;
	published_at: string | null;
	created_at: string;
	updated_at: string;
}

function fromRow(row: PostRow): Post {
	return {
		...row,
		status: row.status as PostStatus,
		media_type: row.media_type as MediaType | null,
		hashtags: row.hashtags ? (JSON.parse(row.hashtags) as string[]) : [],
		workflow: row.workflow ? (JSON.parse(row.workflow) as PostWorkflow) : null,
	};
}

export function listPosts(tenantId: string, status?: PostStatus): Post[] {
	const db = getDb();
	if (status) {
		const rows = db
			.prepare('SELECT * FROM posts WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC')
			.all(tenantId, status) as PostRow[];
		return rows.map(fromRow);
	}
	const rows = db
		.prepare('SELECT * FROM posts WHERE tenant_id = ? ORDER BY created_at DESC')
		.all(tenantId) as PostRow[];
	return rows.map(fromRow);
}

export function getPost(id: string): Post | null {
	const row = getDb().prepare('SELECT * FROM posts WHERE id = ?').get(id) as PostRow | null;
	return row ? fromRow(row) : null;
}

export function createPost(data: Omit<Post, 'created_at' | 'updated_at'>): void {
	getDb()
		.prepare(
			`INSERT INTO posts (id, tenant_id, status, title, content, hashtags, media_type, workflow, media_path, scheduled_date, scheduled_time, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			data.id,
			data.tenant_id,
			data.status,
			data.title ?? null,
			data.content,
			data.hashtags.length ? JSON.stringify(data.hashtags) : null,
			data.media_type ?? null,
			data.workflow ? JSON.stringify(data.workflow) : null,
			data.media_path ?? null,
			data.scheduled_date ?? null,
			data.scheduled_time ?? null,
			data.published_at ?? null
		);
}

export function updatePost(
	id: string,
	data: Partial<Omit<Post, 'id' | 'tenant_id' | 'created_at'>>
): void {
	const fields: string[] = [];
	const values: (string | null)[] = [];

	if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
	if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
	if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content); }
	if (data.hashtags !== undefined) { fields.push('hashtags = ?'); values.push(JSON.stringify(data.hashtags)); }
	if (data.media_type !== undefined) { fields.push('media_type = ?'); values.push(data.media_type); }
	if (data.workflow !== undefined) { fields.push('workflow = ?'); values.push(data.workflow ? JSON.stringify(data.workflow) : null); }
	if (data.media_path !== undefined) { fields.push('media_path = ?'); values.push(data.media_path); }
	if (data.scheduled_date !== undefined) { fields.push('scheduled_date = ?'); values.push(data.scheduled_date); }
	if (data.scheduled_time !== undefined) { fields.push('scheduled_time = ?'); values.push(data.scheduled_time); }
	if (data.published_at !== undefined) { fields.push('published_at = ?'); values.push(data.published_at); }

	if (fields.length === 0) return;
	fields.push("updated_at = datetime('now')");
	values.push(id);

	getDb().prepare(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function updatePostStatus(id: string, status: PostStatus, publishedAt?: string): void {
	if (status === 'published' && publishedAt) {
		getDb()
			.prepare("UPDATE posts SET status = ?, published_at = ?, updated_at = datetime('now') WHERE id = ?")
			.run(status, publishedAt, id);
	} else {
		getDb()
			.prepare("UPDATE posts SET status = ?, updated_at = datetime('now') WHERE id = ?")
			.run(status, id);
	}
}

export function deletePost(id: string): void {
	getDb().prepare('DELETE FROM posts WHERE id = ?').run(id);
}
