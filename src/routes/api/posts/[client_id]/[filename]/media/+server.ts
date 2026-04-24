import path from 'node:path';
import { json } from '@sveltejs/kit';
import { getPost, updatePost } from '$lib/server/posts';
import { storage } from '$lib/server/storage';
import type { RequestHandler } from './$types';

function isValidSegment(s: string): boolean {
	return s === path.basename(s) && /^[a-z0-9][a-z0-9-_.]*$/i.test(s);
}

export const POST: RequestHandler = async ({ params, request }) => {
	const { client_id, filename } = params;

	if (!isValidSegment(client_id) || !isValidSegment(filename)) {
		return json({ error: 'Invalid parameters' }, { status: 400 });
	}

	const id = filename.replace(/\.json$/, '');
	const post = getPost(id);
	if (!post) return json({ success: false, error: 'Post not found' }, { status: 404 });

	const formData = await request.formData();
	const files = formData.getAll('file') as File[];

	if (!files || files.length === 0) {
		return json({ success: false, error: 'No files provided' }, { status: 400 });
	}

	// Delete previous media if any
	if (post.media_path && storage.exists(client_id, post.media_path)) {
		await storage.delete(client_id, post.media_path).catch(() => {});
	}

	const newFilenames: string[] = [];

	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		const ext = path.extname(file.name) || '.jpg';
		const newFilename = files.length > 1
			? `${id}-${String(i + 1).padStart(2, '0')}${ext}`
			: `${id}${ext}`;

		const arrayBuffer = await file.arrayBuffer();
		await storage.put(client_id, newFilename, Buffer.from(arrayBuffer), file.type || 'application/octet-stream');
		newFilenames.push(newFilename);
	}

	// Store first file as media_path
	updatePost(id, { media_path: newFilenames[0] });

	return json({ success: true, media_files: newFilenames });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { client_id, filename } = params;

	if (!isValidSegment(client_id) || !isValidSegment(filename)) {
		return json({ error: 'Invalid parameters' }, { status: 400 });
	}

	const id = filename.replace(/\.json$/, '');
	const post = getPost(id);
	if (!post) return json({ error: 'Post not found' }, { status: 404 });

	if (post.media_path && storage.exists(client_id, post.media_path)) {
		await storage.delete(client_id, post.media_path).catch(() => {});
	}

	updatePost(id, { media_path: null });
	return json({ success: true });
};
