<script lang="ts">
	import { SiInstagram, SiFacebook } from '@icons-pack/svelte-simple-icons';
	import { untrack } from 'svelte';
	import { FileEdit, CalendarPlus, Check, Clock, Plus, Pencil, X, ImagePlus, Trash2 } from 'lucide-svelte';
	import type { PageData } from './$types';
	import type { PostWithMeta, PostPlatform } from '$lib/server/db';
	import { PLATFORM_CONFIG as PLATFORM, normPlatforms } from '$lib/social';
	import ConfirmDialog from '$lib/components/ui/dialog/ConfirmDialog.svelte';
	import PlatformSelect from '$lib/components/ui/platform-select/PlatformSelect.svelte';
	import Drawer from '$lib/components/ui/drawer/Drawer.svelte';

	let { data } = $props<{ data: PageData }>();

	let drafts = $state<PostWithMeta[]>(untrack(() => [...data.drafts]));

	const STATUS_BADGE: Record<string, string> = {
		draft: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
		approved: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
	};

	const inputCls = 'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500';
	const labelCls = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5';

	// ── Create drawer ─────────────────────────────────────────────────────────
	let showCreate = $state(false);
	let newTitle = $state('');
	let newContent = $state('');
	let newHashtags = $state('');
	let newMediaInput = $state<HTMLInputElement | null>(null);
	let isCreating = $state(false);

	function openCreate() {
		newTitle = ''; newContent = ''; newHashtags = '';
		showCreate = true;
	}

	async function createDraft() {
		if (!newTitle.trim() || !newContent.trim()) return;
		isCreating = true;
		try {
			const dateStr = new Date().toISOString().slice(0, 10);
			const slug = newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
			const id = `${dateStr}_${slug || 'post'}`;
			const tags = newHashtags.split(/\s+/).map((t) => t.trim()).filter(Boolean);
			const res = await fetch(`/api/posts/${data.tenant}/import`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					workflow: {},
					result: { id, status: 'draft', title: newTitle, content: newContent, hashtags: tags, media_type: 'image' },
				}),
			});
			if (res.ok) {
				const body = await res.json() as { success: boolean; filename: string };
				const files = newMediaInput?.files;
				let mediaFiles: string[] = [];
				if (files && files.length > 0 && body.filename) {
					const fd = new FormData();
					for (let i = 0; i < files.length; i++) fd.append('file', files[i]);
					const mr = await fetch(`/api/posts/${data.tenant}/${body.filename}/media`, { method: 'POST', body: fd });
					if (mr.ok) {
						const mb = await mr.json() as { media_files: string[] };
						mediaFiles = mb.media_files ?? [];
					}
				}
				drafts = [{
					id, status: 'draft', title: newTitle, content: newContent,
					hashtags: tags, platform: [], media_type: 'image',
					client_id: data.tenant, filename: body.filename,
					media_files: mediaFiles, workflow: {},
				}, ...drafts];
				showCreate = false;
			}
		} finally { isCreating = false; }
	}

	// ── Edit drawer ───────────────────────────────────────────────────────────
	let showEdit = $state(false);
	let editingPost = $state<PostWithMeta | null>(null);
	let editTitle = $state('');
	let editContent = $state('');
	let editHashtags = $state('');
	let editPlatforms = $state<PostPlatform[]>([]);
	let editMediaFiles = $state<string[]>([]);
	let isSavingEdit = $state(false);
	let isUploadingMedia = $state(false);

	function openEdit(post: PostWithMeta) {
		editingPost = post;
		editTitle = post.title;
		editContent = post.content;
		editHashtags = post.hashtags?.join(' ') ?? '';
		editPlatforms = normPlatforms(post.platform);
		editMediaFiles = [...(post.media_files ?? [])];
		showEdit = true;
	}

	$effect(() => { if (!showEdit) editingPost = null; });

	async function saveEdit() {
		if (!editingPost || !editTitle.trim() || !editContent.trim()) return;
		isSavingEdit = true;
		try {
			const tags = editHashtags.split(/\s+/).map((t) => t.trim()).filter(Boolean);
			await fetch(`/api/posts/${data.tenant}/${editingPost.filename}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: editTitle, content: editContent, hashtags: tags, platform: editPlatforms }),
			});
			editingPost.title = editTitle;
			editingPost.content = editContent;
			editingPost.hashtags = tags;
			editingPost.platform = editPlatforms;
			drafts = [...drafts];
			showEdit = false;
		} finally { isSavingEdit = false; }
	}

	async function handleMediaUpload(event: Event) {
		if (!editingPost) return;
		const input = event.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;
		isUploadingMedia = true;
		const fd = new FormData();
		for (let i = 0; i < files.length; i++) fd.append('file', files[i]);
		const res = await fetch(`/api/posts/${data.tenant}/${editingPost.filename}/media`, { method: 'POST', body: fd });
		if (res.ok) {
			const body = await res.json() as { media_files: string[] };
			editMediaFiles = body.media_files ?? [];
			editingPost.media_files = editMediaFiles;
		}
		input.value = '';
		isUploadingMedia = false;
	}

	async function removeMedia() {
		if (!editingPost) return;
		await fetch(`/api/posts/${data.tenant}/${editingPost.filename}/media`, { method: 'DELETE' });
		editMediaFiles = [];
		editingPost.media_files = [];
	}

	// ── Delete confirm ────────────────────────────────────────────────────────
	let postToDelete = $state<PostWithMeta | null>(null);
	let showDeleteConfirm = $state(false);
	let isDeletingPost = $state(false);

	function requestDelete(post: PostWithMeta) {
		postToDelete = post;
		showDeleteConfirm = true;
	}

	async function confirmDelete() {
		if (!postToDelete) return;
		isDeletingPost = true;
		try {
			const res = await fetch(`/api/posts/${data.tenant}/${postToDelete.filename}`, { method: 'DELETE' });
			if (res.ok) {
				drafts = drafts.filter((p) => p.id !== postToDelete!.id);
				if (editingPost?.id === postToDelete.id) showEdit = false;
				postToDelete = null;
				showDeleteConfirm = false;
			}
		} finally { isDeletingPost = false; }
	}

	// ── Schedule drawer ───────────────────────────────────────────────────────
	let showSchedule = $state(false);
	let schedulingPost = $state<PostWithMeta | null>(null);
	let schedDate = $state('');
	let schedTime = $state('10:00');
	let schedPlatforms = $state<PostPlatform[]>(['instagram_feed']);
	let isSavingSched = $state(false);

	function openSchedule(post: PostWithMeta) {
		schedulingPost = post;
		schedDate = '';
		schedTime = '10:00';
		schedPlatforms = normPlatforms(post.platform).length > 0 ? normPlatforms(post.platform) : ['instagram_feed'];
		showSchedule = true;
	}

	$effect(() => { if (!showSchedule) schedulingPost = null; });

	async function saveSchedule() {
		if (!schedulingPost || !schedDate) return;
		isSavingSched = true;
		try {
			await fetch(`/api/posts/${data.tenant}/${schedulingPost.filename}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'scheduled', scheduled_date: schedDate, scheduled_time: schedTime || undefined, platform: schedPlatforms }),
			});
			drafts = drafts.filter((p) => p.id !== schedulingPost!.id);
			showSchedule = false;
		} finally { isSavingSched = false; }
	}

	// ── Approve toggle ────────────────────────────────────────────────────────
	let approvingId = $state<string | null>(null);

	async function toggleApprove(post: PostWithMeta) {
		approvingId = post.id;
		const newStatus = post.status === 'approved' ? 'draft' : 'approved';
		try {
			await fetch(`/api/posts/${data.tenant}/${post.filename}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: newStatus }),
			});
			post.status = newStatus;
			drafts = [...drafts];
		} finally { approvingId = null; }
	}
</script>

<div class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">

	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div>
			<div class="mb-0.5 flex items-center gap-2">
				<FileEdit class="h-5 w-5 text-slate-400" />
				<h2 class="text-xl font-bold text-slate-900 dark:text-white">Drafts</h2>
				<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800">
					{drafts.length}
				</span>
			</div>
			<p class="text-sm text-slate-500 dark:text-slate-400">
				Posts without a scheduled date. Approve and schedule to add to the planner.
			</p>
		</div>
		<button
			onclick={openCreate}
			class="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
		>
			<Plus class="h-4 w-4" /> New Draft
		</button>
	</div>

	{#if drafts.length === 0}
		<div class="rounded-xl border-2 border-dashed border-slate-300 p-16 text-center dark:border-slate-700">
			<FileEdit class="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
			<p class="mb-3 text-sm text-slate-500 dark:text-slate-400">No drafts yet.</p>
			<button onclick={openCreate} class="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
				Create your first draft
			</button>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each drafts as post (post.id)}
				<div class="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
					<!-- Thumbnail -->
					{#if post.media_files?.length > 0}
						<div class="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-900 dark:border-slate-700">
							{#if post.media_files[0].match(/\.(mp4|webm)$/i)}
								<video src="/api/media/{data.tenant}/{post.media_files[0]}" class="h-full w-full object-contain"><track kind="captions" /></video>
							{:else}
								<img src="/api/media/{data.tenant}/{post.media_files[0]}" alt="" class="h-full w-full object-contain" />
							{/if}
						</div>
					{:else}
						<div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
							<ImagePlus class="h-5 w-5 text-slate-300 dark:text-slate-600" />
						</div>
					{/if}

					<div class="min-w-0 flex-1">
						<div class="mb-2 flex flex-wrap items-center gap-2">
							<span class="rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide {STATUS_BADGE[post.status] ?? STATUS_BADGE.draft}">
								{post.status}
							</span>
							{#each normPlatforms(post.platform) as plt}
								{@render PlatformBadge({ platform: plt })}
							{/each}
							<span class="truncate font-mono text-xs text-slate-400">{post.id}</span>
						</div>
						<p class="mb-1 font-semibold text-slate-900 dark:text-white">{post.title}</p>
						<p class="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{post.content}</p>
					</div>

					<div class="flex shrink-0 items-center gap-2">
						<button
							onclick={() => openEdit(post)}
							class="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
						>
							<Pencil class="h-3.5 w-3.5" /> Edit
						</button>
						<button
							onclick={() => toggleApprove(post)}
							disabled={approvingId === post.id}
							class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 {post.status === 'approved'
								? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400'
								: 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}"
						>
							<Check class="h-3.5 w-3.5" />
							{post.status === 'approved' ? 'Approved' : 'Approve'}
						</button>
						<button
							onclick={() => openSchedule(post)}
							disabled={post.status !== 'approved'}
							class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors {post.status === 'approved'
								? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400'
								: 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-50 dark:border-slate-700 dark:bg-slate-800'}"
						>
							<CalendarPlus class="h-3.5 w-3.5" /> Schedule
						</button>
						<button
							onclick={() => requestDelete(post)}
							class="rounded-lg border border-transparent p-1.5 text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-800 dark:hover:bg-red-900/20"
						>
							<Trash2 class="h-4 w-4" />
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- ── Delete confirm ────────────────────────────────────────────────────────── -->
<ConfirmDialog
	bind:open={showDeleteConfirm}
	title="Delete draft?"
	description={postToDelete ? `"${postToDelete.title}" will be permanently removed.` : ''}
	isLoading={isDeletingPost}
	onconfirm={confirmDelete}
/>

<!-- ── Create drawer ─────────────────────────────────────────────────────────── -->
<Drawer bind:open={showCreate}>
	<div class="flex h-full flex-col">
		<div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
			<h2 class="text-lg font-bold text-slate-900 dark:text-white">New Draft</h2>
			<button onclick={() => (showCreate = false)} class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
				<X class="h-5 w-5" />
			</button>
		</div>
		<div class="flex-1 overflow-y-auto px-6 py-5">
			<div class="flex flex-col gap-4">
				<div>
					<label for="create-title" class={labelCls}>Title</label>
					<input id="create-title" bind:value={newTitle} type="text" placeholder="Post title" class={inputCls} />
				</div>
				<div>
					<label for="create-content" class={labelCls}>Content</label>
					<textarea id="create-content" bind:value={newContent} rows="5" placeholder="Post copy…" class="{inputCls} resize-none"></textarea>
				</div>
				<div>
					<label for="create-hashtags" class={labelCls}>Hashtags <span class="font-normal normal-case text-slate-400">(space separated)</span></label>
					<input id="create-hashtags" bind:value={newHashtags} type="text" placeholder="#hashtag1 #hashtag2" class={inputCls} />
				</div>
				<div>
					<label for="create-image" class={labelCls}>Image <span class="font-normal normal-case text-slate-400">(optional)</span></label>
					<input
						id="create-image"
						bind:this={newMediaInput}
						type="file" accept="image/*,video/*" multiple
						class="w-full cursor-pointer text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-900/30 dark:file:text-indigo-400"
					/>
				</div>
			</div>
		</div>
		<div class="flex shrink-0 gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
			<button
				onclick={createDraft}
				disabled={!newTitle.trim() || !newContent.trim() || isCreating}
				class="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
			>
				{isCreating ? 'Creating…' : 'Create Draft'}
			</button>
			<button
				onclick={() => (showCreate = false)}
				class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
			>
				Cancel
			</button>
		</div>
	</div>
</Drawer>

<!-- ── Edit drawer ────────────────────────────────────────────────────────────── -->
<Drawer bind:open={showEdit}>
	<div class="flex h-full flex-col">
		{#if editingPost}
			<div class="flex shrink-0 items-start justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
				<div class="min-w-0 flex-1 pr-4">
					<div class="mb-1 flex flex-wrap items-center gap-2">
						<span class="rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide {STATUS_BADGE[editingPost.status] ?? STATUS_BADGE.draft}">
							{editingPost.status}
						</span>
						{#if editingPost.media_type}
							<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-500 dark:bg-slate-800">{editingPost.media_type}</span>
						{/if}
						{#if (editingPost.workflow as any)?.strategy?.framework}
							<span class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400">{(editingPost.workflow as any).strategy.framework}</span>
						{/if}
					</div>
					<p class="truncate font-mono text-xs text-slate-400">{editingPost.id}</p>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<button
						onclick={() => requestDelete(editingPost!)}
						class="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
					>
						<Trash2 class="h-3.5 w-3.5" /> Delete
					</button>
					<button onclick={() => (showEdit = false)} class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
						<X class="h-5 w-5" />
					</button>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto px-6 py-5">
				{#if (editingPost.workflow as any)?.strategy?.reasoning}
					<div class="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
						<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Strategy Reasoning</p>
						<p class="text-sm italic leading-relaxed text-slate-600 dark:text-slate-400">{(editingPost.workflow as any).strategy.reasoning}</p>
					</div>
				{/if}

				<div class="flex flex-col gap-4">
					<div>
						<label for="edit-title" class={labelCls}>Title</label>
						<input id="edit-title" bind:value={editTitle} type="text" class={inputCls} />
					</div>
					<div>
						<label for="edit-content" class={labelCls}>Content</label>
						<textarea id="edit-content" bind:value={editContent} rows="8" class="{inputCls} resize-y"></textarea>
					</div>
					<div>
						<label for="edit-hashtags" class={labelCls}>Hashtags <span class="font-normal normal-case text-slate-400">(space separated)</span></label>
						<input id="edit-hashtags" bind:value={editHashtags} type="text" class={inputCls} />
						{#if editHashtags}
							<p class="mt-1.5 flex flex-wrap gap-1 text-xs text-indigo-500 dark:text-indigo-400">
								{#each editHashtags.split(/\s+/).filter(Boolean) as tag}<span>{tag}</span>{/each}
							</p>
						{/if}
					</div>
					<div>
						<p class={labelCls}>Platform</p>
						<PlatformSelect bind:value={editPlatforms} />
					</div>

					<!-- Media -->
					<div>
						<div class="mb-1.5 flex items-center justify-between">
							<p class={labelCls}>Image</p>
							{#if editMediaFiles.length > 0}
								<button onclick={removeMedia} class="flex items-center gap-1 text-xs text-red-500 transition-colors hover:text-red-700">
									<Trash2 class="h-3 w-3" /> Remove all
								</button>
							{/if}
						</div>
						{#if editMediaFiles.length > 0}
							<div class="mb-3 grid gap-2 {editMediaFiles.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}">
								{#each editMediaFiles as f}
									<div class="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-900 dark:border-slate-700">
										{#if f.match(/\.(mp4|webm)$/i)}
											<video src="/api/media/{data.tenant}/{f}" controls class="max-h-full max-w-full object-contain"><track kind="captions" /></video>
										{:else}
											<img src="/api/media/{data.tenant}/{f}" alt="Media" class="max-h-full max-w-full object-contain" />
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<div class="mb-3 flex aspect-video items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-xs font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800/50">
								<ImagePlus class="mr-2 h-4 w-4" /> No image attached
							</div>
						{/if}
						<input
							type="file" accept="image/*,video/*" multiple
							onchange={handleMediaUpload} disabled={isUploadingMedia}
							class="w-full cursor-pointer text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50 dark:file:bg-indigo-900/30 dark:file:text-indigo-400"
						/>
						{#if isUploadingMedia}
							<p class="mt-1 animate-pulse text-xs text-indigo-600 dark:text-indigo-400">Uploading…</p>
						{/if}
					</div>
				</div>
			</div>

			<div class="flex shrink-0 gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
				<button
					onclick={saveEdit}
					disabled={!editTitle.trim() || !editContent.trim() || isSavingEdit}
					class="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
				>
					{isSavingEdit ? 'Saving…' : 'Save Changes'}
				</button>
				<button
					onclick={() => (showEdit = false)}
					class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
				>
					Cancel
				</button>
			</div>
		{/if}
	</div>
</Drawer>

<!-- ── Schedule drawer ────────────────────────────────────────────────────────── -->
<Drawer bind:open={showSchedule}>
	<div class="flex h-full flex-col">
		{#if schedulingPost}
			<div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
				<div class="min-w-0 flex-1 pr-4">
					<h2 class="text-lg font-bold text-slate-900 dark:text-white">Schedule Post</h2>
					<p class="truncate text-sm text-slate-500">{schedulingPost.title}</p>
				</div>
				<button onclick={() => (showSchedule = false)} class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
					<X class="h-5 w-5" />
				</button>
			</div>
			<div class="flex-1 overflow-y-auto px-6 py-5">
				<div class="flex flex-col gap-4">
					<div>
						<p class={labelCls}>Platform</p>
						<PlatformSelect bind:value={schedPlatforms} />
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="sched-date" class={labelCls}>Date</label>
							<input id="sched-date" type="date" bind:value={schedDate} min={new Date().toISOString().slice(0, 10)} class={inputCls} />
						</div>
						<div>
							<label for="sched-time" class={labelCls}>Time <span class="font-normal normal-case text-slate-400">(opt.)</span></label>
							<input id="sched-time" type="time" bind:value={schedTime} class={inputCls} />
						</div>
					</div>
				</div>
			</div>
			<div class="flex shrink-0 gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
				<button
					onclick={saveSchedule}
					disabled={!schedDate || isSavingSched}
					class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
				>
					<Clock class="h-4 w-4" />
					{isSavingSched ? 'Saving…' : 'Add to Planner'}
				</button>
				<button
					onclick={() => (showSchedule = false)}
					class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
				>
					Cancel
				</button>
			</div>
		{/if}
	</div>
</Drawer>

<!-- Platform badge snippet used in the list -->
{#snippet PlatformBadge(props: { platform: PostPlatform })}
	{@const plt = props.platform}
	{@const cfg = PLATFORM[plt]}
	<span class="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
		{#if plt === 'linkedin'}
			<svg width="11" height="11" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true">
				<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
			</svg>
		{:else if plt === 'facebook'}
			<SiFacebook size={11} color="#1877F2" />
		{:else}
			<SiInstagram
				size={11}
				color={plt === 'instagram_feed' ? '#E1306C' : plt === 'instagram_stories' ? '#C13584' : '#FF0000'}
			/>
		{/if}
		{cfg?.label ?? plt}
	</span>
{/snippet}
