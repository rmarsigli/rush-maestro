<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { ArrowLeft, Save, FileEdit, Trash2 } from 'lucide-svelte';

	let { data } = $props<{ data: PageData }>();

	let title = $state(untrack(() => data.post.title));
	let content = $state(untrack(() => data.post.content));
	let hashtags = $state(untrack(() => data.post.hashtags.join(' ')));
	let status = $state(untrack(() => data.post.status));
	let mediaType = $state(untrack(() => data.post.media_type));
	$effect(() => {
		title = data.post.title;
		content = data.post.content;
		hashtags = data.post.hashtags.join(' ');
		status = data.post.status;
		mediaType = data.post.media_type;
	});
	let saving = $state(false);
	let uploadingMedia = $state(false);

	async function handleFileUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		const files = target.files;
		if (!files || files.length === 0) return;

		uploadingMedia = true;
		const formData = new FormData();
		for (let i = 0; i < files.length; i++) {
			formData.append('file', files[i]);
		}

		const res = await fetch(`/api/posts/${data.client_id}/${data.post.filename}/media`, {
			method: 'POST',
			body: formData
		});

		if (res.ok) {
			window.location.reload();
		} else {
			alert('Failed to upload media');
		}
		uploadingMedia = false;
	}

	async function savePost() {
		saving = true;
		const tags = hashtags.split(' ').map((t: string) => t.trim()).filter((t: string) => t);
		
		await fetch(`/api/posts/${data.client_id}/${data.post.filename}`, {
			method: 'POST',
			body: JSON.stringify({
				title,
				content,
				hashtags: tags,
				status,
				media_type: mediaType
			})
		});
		
		saving = false;
		window.location.href = `/${data.client_id}/social`;
	}

	async function deletePost() {
		if (confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
			const res = await fetch(`/api/posts/${data.client_id}/${data.post.filename}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				window.location.href = `/${data.client_id}/social`;
			} else {
				alert('Failed to delete post');
			}
		}
	}
</script>

<div class="h-14 flex items-center px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm z-10 sticky top-0">
	<div class="flex items-center gap-4">
		<a href="/{data.client_id}/social" class="text-slate-500 hover:text-slate-900 dark:hover:text-slate-300">
			<ArrowLeft class="w-5 h-5" />
		</a>
		<h2 class="font-semibold text-lg flex items-center gap-2">
			<FileEdit class="w-4 h-4 text-slate-400" />
			Edit Post
		</h2>
	</div>
	<div class="ml-auto flex items-center gap-3">
		<button 
			onclick={deletePost}
			title="Delete Post"
			class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
		>
			<Trash2 class="w-4 h-4" />
		</button>
		<button 
			onclick={savePost}
			disabled={saving}
			class="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-md font-medium text-sm transition-colors disabled:opacity-50"
		>
			<Save class="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
		</button>
	</div>
</div>

<div class="max-w-5xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
	<!-- Editor -->
	<div class="lg:col-span-2 space-y-6">
		<div>
			<label for="post-title" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title (Internal)</label>
			<input
				id="post-title"
				type="text"
				bind:value={title}
				class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
			/>
		</div>
		
		<div>
			<label for="post-content" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Post Content</label>
			<textarea
				id="post-content"
				bind:value={content}
				rows="16"
				class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
			></textarea>
		</div>

		<div>
			<label for="post-hashtags" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Hashtags (space separated)</label>
			<input
				id="post-hashtags"
				type="text"
				bind:value={hashtags}
				class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
			/>
		</div>
	</div>

	<!-- Sidebar Meta -->
	<div class="space-y-6">
		<div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
			<h3 class="text-sm font-bold text-slate-900 dark:text-white mb-3">Media</h3>
			
			{#if data.post.media_files?.length > 0}
				<div class="mb-4 grid gap-2 {data.post.media_files.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}">
					{#each data.post.media_files as mediaFile}
						<div class="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex items-center justify-center aspect-video relative group">
							{#if mediaFile.match(/\.(mp4|webm)$/i)}
								<video src="/api/media/{data.client_id}/{mediaFile}" controls class="w-full h-full object-cover">
									<track kind="captions" />
								</video>
							{:else}
								<img src="/api/media/{data.client_id}/{mediaFile}" alt="Post Media" class="w-full h-full object-cover" />
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="mb-4 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center aspect-video text-slate-400">
					<span class="text-xs font-medium">No media attached</span>
				</div>
			{/if}

			<label class="block cursor-pointer">
				<span class="sr-only">Choose media</span>
				<input type="file" multiple class="block w-full text-sm text-slate-500
				file:mr-4 file:py-2 file:px-4
				file:rounded-md file:border-0
				file:text-sm file:font-semibold
				file:bg-indigo-50 file:text-indigo-700
				hover:file:bg-indigo-100
				dark:file:bg-indigo-900/30 dark:file:text-indigo-400
				cursor-pointer" accept="image/*,video/*"
				onchange={handleFileUpload}
				disabled={uploadingMedia}
				/>
			</label>
			{#if uploadingMedia}
				<p class="text-xs text-indigo-600 mt-2 font-medium animate-pulse">Uploading...</p>
			{/if}
		</div>

		<div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
			<h3 class="text-sm font-bold text-slate-900 dark:text-white mb-3">AI Workflow</h3>
			
			{#if data.post.workflow}
				<div class="space-y-4">
					<div>
						<span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Strategy</span>
						<p class="text-sm text-slate-700 dark:text-slate-300 mt-1">
							<span class="font-medium">{data.post.workflow.strategy?.framework}:</span> {data.post.workflow.strategy?.reasoning}
						</p>
					</div>
					<div>
						<span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Clarity</span>
						<p class="text-sm text-slate-700 dark:text-slate-300 mt-1">{data.post.workflow.clarity?.changes}</p>
					</div>
					<div>
						<span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Impact</span>
						<p class="text-sm text-slate-700 dark:text-slate-300 mt-1">{data.post.workflow.impact?.changes}</p>
					</div>
				</div>
			{:else}
				<p class="text-sm text-slate-500">No workflow data available.</p>
			{/if}
		</div>
		
		<div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
			<h3 class="text-sm font-bold text-slate-900 dark:text-white mb-3">Post Info</h3>
			<div class="space-y-3 text-sm text-slate-600 dark:text-slate-400">
				<div class="flex justify-between items-center">
					<span>ID</span>
					<span class="font-mono text-xs">{data.post.id}</span>
				</div>
				<div class="flex justify-between items-center">
					<span>Status</span>
					<select bind:value={status} class="text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 {status === 'approved' ? 'text-emerald-600' : 'text-amber-600'}">
						<option value="draft" class="text-amber-600 font-medium">draft</option>
						<option value="approved" class="text-emerald-600 font-medium">approved</option>
					</select>
				</div>
				<div class="flex justify-between items-center">
					<span>Media</span>
					<select bind:value={mediaType} class="text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 font-bold tracking-wider uppercase focus:outline-none focus:ring-1 focus:ring-indigo-500 text-indigo-600">
						<option value="image">image</option>
						<option value="video">video</option>
						<option value="carousel">carousel</option>
						<option value="story">story</option>
					</select>
				</div>
			</div>
		</div>
	</div>
</div>
