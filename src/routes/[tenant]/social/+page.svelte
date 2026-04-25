<script lang="ts">
	import { SiInstagram, SiFacebook } from '@icons-pack/svelte-simple-icons';
	import { untrack } from 'svelte';
	import { ChevronLeft, ChevronRight, Plus, X, Clock, Trash2, ImagePlus } from 'lucide-svelte';
	import type { PageData } from './$types';
	import type { PostWithMeta, PostPlatform } from '$lib/server/db';
	import { PLATFORM_CONFIG as PLATFORM, normPlatforms } from '$lib/social';
	import ConfirmDialog from '$lib/components/ui/dialog/ConfirmDialog.svelte';
	import PlatformSelect from '$lib/components/ui/platform-select/PlatformSelect.svelte';
	import Drawer from '$lib/components/ui/drawer/Drawer.svelte';

	let { data } = $props<{ data: PageData }>();

	// ── Calendar state ────────────────────────────────────────────────────────
	const today = new Date();
	let viewYear = $state(today.getFullYear());
	let viewMonth = $state(today.getMonth());

	const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
	const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

	let scheduled = $state<PostWithMeta[]>(untrack(() => data.scheduled));
	$effect(() => { scheduled = data.scheduled; });

	const calendarCells = $derived.by(() => {
		const firstDay = new Date(viewYear, viewMonth, 1).getDay();
		const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
		const byDate = new Map<string, PostWithMeta[]>();
		for (const p of scheduled) {
			if (!p.scheduled_date) continue;
			if (!byDate.has(p.scheduled_date)) byDate.set(p.scheduled_date, []);
			byDate.get(p.scheduled_date)!.push(p);
		}
		const cells: Array<{ date: string | null; day: number | null; posts: PostWithMeta[] }> = [];
		for (let i = 0; i < firstDay; i++) cells.push({ date: null, day: null, posts: [] });
		for (let d = 1; d <= daysInMonth; d++) {
			const mm = String(viewMonth + 1).padStart(2, '0');
			const dd = String(d).padStart(2, '0');
			const date = `${viewYear}-${mm}-${dd}`;
			cells.push({ date, day: d, posts: byDate.get(date) ?? [] });
		}
		while (cells.length % 7 !== 0) cells.push({ date: null, day: null, posts: [] });
		return cells;
	});

	function prevMonth() { if (viewMonth === 0) { viewMonth = 11; viewYear--; } else viewMonth--; }
	function nextMonth() { if (viewMonth === 11) { viewMonth = 0; viewYear++; } else viewMonth++; }
	function isToday(date: string | null) { return date === today.toISOString().slice(0, 10); }

	// ── Post edit drawer ──────────────────────────────────────────────────────
	let showEditDrawer = $state(false);
	let selectedPost = $state<PostWithMeta | null>(null);
	let editTitle = $state('');
	let editContent = $state('');
	let editHashtags = $state('');
	let editPlatforms = $state<PostPlatform[]>([]);
	let editDate = $state('');
	let editTime = $state('');
	let editMediaFiles = $state<string[]>([]);
	let isSavingPost = $state(false);
	let isUploadingMedia = $state(false);

	function openPostDrawer(post: PostWithMeta) {
		selectedPost = post;
		editTitle = post.title;
		editContent = post.content;
		editHashtags = post.hashtags?.join(' ') ?? '';
		editPlatforms = normPlatforms(post.platform);
		editDate = post.scheduled_date ?? '';
		editTime = post.scheduled_time ?? '';
		editMediaFiles = [...(post.media_files ?? [])];
		showEditDrawer = true;
	}

	$effect(() => { if (!showEditDrawer) selectedPost = null; });

	async function savePost() {
		if (!selectedPost || !editTitle.trim() || !editContent.trim()) return;
		isSavingPost = true;
		try {
			const tags = editHashtags.split(/\s+/).map((t) => t.trim()).filter(Boolean);
			const res = await fetch(`/api/posts/${data.tenant}/${selectedPost.filename}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: editTitle, content: editContent, hashtags: tags,
					platform: editPlatforms,
					scheduled_date: editDate || undefined,
					scheduled_time: editTime || undefined,
				}),
			});
			if (res.ok) {
				selectedPost.title = editTitle;
				selectedPost.content = editContent;
				selectedPost.hashtags = tags;
				selectedPost.platform = editPlatforms;
				selectedPost.scheduled_date = editDate || undefined;
				selectedPost.scheduled_time = editTime || undefined;
				scheduled = [...scheduled];
				showEditDrawer = false;
			}
		} finally { isSavingPost = false; }
	}

	async function handleMediaUpload(event: Event) {
		if (!selectedPost) return;
		const input = event.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;
		isUploadingMedia = true;
		const fd = new FormData();
		for (let i = 0; i < files.length; i++) fd.append('file', files[i]);
		const res = await fetch(`/api/posts/${data.tenant}/${selectedPost.filename}/media`, { method: 'POST', body: fd });
		if (res.ok) {
			const body = await res.json() as { media_files: string[] };
			editMediaFiles = body.media_files ?? [];
			selectedPost.media_files = editMediaFiles;
		}
		input.value = '';
		isUploadingMedia = false;
	}

	async function removeMedia() {
		if (!selectedPost) return;
		await fetch(`/api/posts/${data.tenant}/${selectedPost.filename}/media`, { method: 'DELETE' });
		editMediaFiles = [];
		selectedPost.media_files = [];
	}

	// ── Delete confirm ────────────────────────────────────────────────────────
	let showDeleteConfirm = $state(false);
	let isDeletingPost = $state(false);

	async function confirmDelete() {
		if (!selectedPost) return;
		isDeletingPost = true;
		try {
			const res = await fetch(`/api/posts/${data.tenant}/${selectedPost.filename}`, { method: 'DELETE' });
			if (res.ok) {
				scheduled = scheduled.filter((p) => p.id !== selectedPost!.id);
				showEditDrawer = false;
				showDeleteConfirm = false;
			}
		} finally { isDeletingPost = false; }
	}

	// ── New post drawer ───────────────────────────────────────────────────────
	let showNewPostDrawer = $state(false);
	let newPostDate = $state('');
	let newTitle = $state('');
	let newContent = $state('');
	let newHashtags = $state('');
	let newTime = $state('10:00');
	let newPlatforms = $state<PostPlatform[]>(['instagram_feed']);
	let newMediaInput = $state<HTMLInputElement | null>(null);
	let isCreating = $state(false);

	function openNewPostDrawer(date: string) {
		newPostDate = date;
		newTitle = ''; newContent = ''; newHashtags = '';
		newTime = '10:00'; newPlatforms = ['instagram_feed'];
		showNewPostDrawer = true;
	}

	async function createPost() {
		if (!newPostDate || !newTitle.trim() || !newContent.trim()) return;
		isCreating = true;
		try {
			const slug = newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
			const id = `${newPostDate}_${slug || 'post'}`;
			const tags = newHashtags.split(/\s+/).map((t) => t.trim()).filter(Boolean);
			const res = await fetch(`/api/posts/${data.tenant}/import`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					workflow: {},
					result: { id, status: 'scheduled', title: newTitle, content: newContent,
						hashtags: tags, media_type: 'image',
						scheduled_date: newPostDate, scheduled_time: newTime || undefined,
						platform: newPlatforms },
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
				scheduled = [...scheduled, {
					id, status: 'scheduled', title: newTitle, content: newContent,
					hashtags: tags, media_type: 'image',
					scheduled_date: newPostDate, scheduled_time: newTime || undefined,
					platform: newPlatforms,
					client_id: data.tenant, filename: `${id}.json`, media_files: mediaFiles, workflow: {},
				}];
				showNewPostDrawer = false;
			}
		} finally { isCreating = false; }
	}

	const inputCls = 'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500';
	const labelCls = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5';
</script>

<div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">

	<!-- Calendar header -->
	<div class="mb-6 flex items-center justify-between">
		<h2 class="text-xl font-bold text-slate-900 dark:text-white">{MONTHS[viewMonth]} {viewYear}</h2>
		<div class="flex items-center gap-1">
			<button onclick={prevMonth} class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft class="h-5 w-5" /></button>
			<button onclick={() => { viewYear = today.getFullYear(); viewMonth = today.getMonth(); }} class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">Today</button>
			<button onclick={nextMonth} class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight class="h-5 w-5" /></button>
		</div>
	</div>

	<!-- Day headers -->
	<div class="mb-1 grid grid-cols-7">
		{#each DAYS as d}
			<div class="py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{d}</div>
		{/each}
	</div>

	<!-- Calendar grid -->
	<div class="grid grid-cols-7 border-l border-t border-slate-200 dark:border-slate-800">
		{#each calendarCells as cell}
			<div class="group/cell relative min-h-[110px] border-b border-r border-slate-200 p-1.5 dark:border-slate-800 {cell.date ? 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/40' : 'bg-slate-50 dark:bg-slate-950'}">
				{#if cell.day}
					<div class="mb-1 flex items-center justify-between px-0.5">
						<span class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold {isToday(cell.date) ? 'bg-indigo-500 text-white' : 'text-slate-500 dark:text-slate-400'}">{cell.day}</span>
						<button
							onclick={() => openNewPostDrawer(cell.date!)}
							class="flex h-5 w-5 items-center justify-center rounded text-slate-400 opacity-0 transition-opacity hover:bg-indigo-50 hover:text-indigo-600 group-hover/cell:opacity-100 dark:hover:bg-indigo-900/30"
						>
							<Plus class="h-3.5 w-3.5" />
						</button>
					</div>
					<div class="flex flex-col gap-0.5">
						{#each cell.posts.slice(0, 3) as post (post.id)}
							<button
								onclick={() => openPostDrawer(post)}
								class="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left opacity-100 transition-opacity hover:opacity-80"
								style="background: {post.status === 'published' ? 'rgb(220 252 231)' : 'rgb(254 243 199)'}"
							>
								{#each normPlatforms(post.platform).slice(0, 2) as plt}
									{@render PlatformDot({ platform: plt })}
								{/each}
								<span class="truncate text-[10px] font-medium text-slate-700">{post.title}</span>
							</button>
						{/each}
						{#if cell.posts.length > 3}
							<span class="pl-1 text-[10px] text-slate-400">+{cell.posts.length - 3} more</span>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Legend -->
	<div class="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
		<span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm border border-amber-300 bg-amber-100"></span> Scheduled</span>
		<span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm border border-emerald-300 bg-emerald-100"></span> Published</span>
		<span class="flex items-center gap-1.5">
			<SiInstagram size={12} color="#E1306C" />
			Instagram
		</span>
		<span class="flex items-center gap-1.5">
			<SiFacebook size={12} color="#1877F2" />
			Facebook
		</span>
		<span class="flex items-center gap-1.5">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true">
				<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
			</svg>
			LinkedIn
		</span>
	</div>
</div>

<!-- ── Delete confirm ────────────────────────────────────────────────────────── -->
<ConfirmDialog
	bind:open={showDeleteConfirm}
	title="Delete post?"
	description={selectedPost ? `"${selectedPost.title}" will be permanently removed.` : ''}
	isLoading={isDeletingPost}
	onconfirm={confirmDelete}
/>

<!-- ── New post drawer ───────────────────────────────────────────────────────── -->
<Drawer bind:open={showNewPostDrawer}>
	<div class="flex h-full flex-col">
		<div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
			<div>
				<h2 class="text-lg font-bold text-slate-900 dark:text-white">New Post</h2>
				{#if newPostDate}
					<p class="font-mono text-xs text-slate-400">{newPostDate}</p>
				{/if}
			</div>
			<button onclick={() => (showNewPostDrawer = false)} class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
				<X class="h-5 w-5" />
			</button>
		</div>

		<div class="flex-1 overflow-y-auto px-6 py-5">
			<div class="flex flex-col gap-4">
				<div>
					<p class={labelCls}>Platform</p>
					<PlatformSelect bind:value={newPlatforms} />
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="new-date" class={labelCls}>Date <span class="font-normal normal-case text-slate-400">(fixed)</span></label>
						<input id="new-date" type="date" value={newPostDate} disabled class="{inputCls} cursor-not-allowed opacity-60" />
					</div>
					<div>
						<label for="new-time" class={labelCls}>Time <span class="font-normal normal-case text-slate-400">(opt.)</span></label>
						<input id="new-time" type="time" bind:value={newTime} class={inputCls} />
					</div>
				</div>
				<div>
					<label for="new-title" class={labelCls}>Title</label>
					<input id="new-title" bind:value={newTitle} type="text" placeholder="Post title" class={inputCls} />
				</div>
				<div>
					<label for="new-content" class={labelCls}>Content</label>
					<textarea id="new-content" bind:value={newContent} rows="5" placeholder="Post copy…" class="{inputCls} resize-none"></textarea>
				</div>
				<div>
					<label for="new-hashtags" class={labelCls}>Hashtags <span class="font-normal normal-case text-slate-400">(space separated)</span></label>
					<input id="new-hashtags" bind:value={newHashtags} type="text" placeholder="#hashtag1 #hashtag2" class={inputCls} />
				</div>
				<div>
					<label for="new-image" class={labelCls}>Image <span class="font-normal normal-case text-slate-400">(optional)</span></label>
					<input id="new-image" bind:this={newMediaInput} type="file" accept="image/*,video/*" multiple class="w-full cursor-pointer text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-900/30 dark:file:text-indigo-400" />
				</div>
			</div>
		</div>

		<div class="flex shrink-0 gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
			<button
				onclick={createPost}
				disabled={!newTitle.trim() || !newContent.trim() || isCreating}
				class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
			>
				<Clock class="h-4 w-4" /> {isCreating ? 'Saving…' : 'Add to Planner'}
			</button>
			<button
				onclick={() => (showNewPostDrawer = false)}
				class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
			>
				Cancel
			</button>
		</div>
	</div>
</Drawer>

<!-- ── Post edit/view drawer ─────────────────────────────────────────────────── -->
<Drawer bind:open={showEditDrawer}>
	<div class="flex h-full flex-col">
		{#if selectedPost}
			<!-- Header -->
			<div class="flex shrink-0 items-start justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
				<div class="min-w-0 flex-1 pr-4">
					<div class="mb-1 flex flex-wrap items-center gap-2">
						<span class="rounded-full px-2 py-0.5 text-xs font-bold uppercase {selectedPost.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">{selectedPost.status}</span>
						{#each normPlatforms(selectedPost.platform) as plt}
							{#if PLATFORM[plt]}
								<span class="flex items-center gap-1 text-xs text-slate-500">
									{@render PlatformDot({ platform: plt })}
									{PLATFORM[plt].label}
								</span>
							{/if}
						{/each}
					</div>
					<p class="truncate font-mono text-xs text-slate-400">{selectedPost.id}</p>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					{#if selectedPost.status !== 'published'}
						<button
							onclick={() => (showDeleteConfirm = true)}
							class="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
						>
							<Trash2 class="h-3.5 w-3.5" /> Delete
						</button>
					{/if}
					<button onclick={() => (showEditDrawer = false)} class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
						<X class="h-5 w-5" />
					</button>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto px-6 py-5">
				{#if selectedPost.status === 'published'}
					<!-- Read-only view -->
					<p class="mb-2 font-bold text-slate-900 dark:text-white">{selectedPost.title}</p>
					{#if selectedPost.scheduled_date}
						<p class="mb-3 text-xs text-slate-400">{selectedPost.scheduled_date}{selectedPost.scheduled_time ? ' · ' + selectedPost.scheduled_time : ''}</p>
					{/if}
					{#if editMediaFiles.length > 0}
						<div class="mb-4 grid gap-2 {editMediaFiles.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}">
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
					{/if}
					<p class="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{selectedPost.content}</p>
					{#if selectedPost.hashtags?.length}
						<p class="flex flex-wrap gap-1 text-xs text-indigo-500 dark:text-indigo-400">
							{#each selectedPost.hashtags as tag}<span>{tag}</span>{/each}
						</p>
					{/if}

				{:else}
					<!-- Editable form -->
					<div class="flex flex-col gap-4">
						<div>
							<p class={labelCls}>Platform</p>
							<PlatformSelect bind:value={editPlatforms} />
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div>
								<label for="edit-date" class={labelCls}>Date</label>
								<input id="edit-date" type="date" bind:value={editDate} class={inputCls} />
							</div>
							<div>
								<label for="edit-time" class={labelCls}>Time <span class="font-normal normal-case text-slate-400">(opt.)</span></label>
								<input id="edit-time" type="time" bind:value={editTime} class={inputCls} />
							</div>
						</div>
						<div>
							<label for="edit-title" class={labelCls}>Title</label>
							<input id="edit-title" bind:value={editTitle} type="text" class={inputCls} />
						</div>
						<div>
							<label for="edit-content" class={labelCls}>Content</label>
							<textarea id="edit-content" bind:value={editContent} rows="7" class="{inputCls} resize-y"></textarea>
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
				{/if}
			</div>

			{#if selectedPost.status !== 'published'}
				<div class="flex shrink-0 gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
					<button
						onclick={savePost}
						disabled={!editTitle.trim() || !editContent.trim() || isSavingPost}
						class="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
					>
						{isSavingPost ? 'Saving…' : 'Save Changes'}
					</button>
					<button
						onclick={() => (showEditDrawer = false)}
						class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
					>
						Cancel
					</button>
				</div>
			{/if}
		{/if}
	</div>
</Drawer>

<!-- Inline platform dot snippet used in the calendar cells -->
{#snippet PlatformDot(props: { platform: PostPlatform })}
	{@const plt = props.platform}
	{#if plt === 'instagram_feed' || plt === 'instagram_stories' || plt === 'instagram_reels'}
		<SiInstagram
			size={10}
			color={plt === 'instagram_feed' ? '#E1306C' : plt === 'instagram_stories' ? '#C13584' : '#FF0000'}
			class="shrink-0"
		/>
	{:else if plt === 'facebook'}
		<SiFacebook size={10} color="#1877F2" class="shrink-0" />
	{:else if plt === 'linkedin'}
		<svg width="10" height="10" viewBox="0 0 24 24" fill="#0A66C2" class="shrink-0" aria-hidden="true">
			<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
		</svg>
	{/if}
{/snippet}
