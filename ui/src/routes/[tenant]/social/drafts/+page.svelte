<script lang="ts">
	import { FileEdit, CalendarPlus, Check, Clock, Plus, Pencil, X } from 'lucide-svelte';
	import type { PageData } from './$types';
	import type { PostWithMeta, PostPlatform } from '$lib/server/db';

	let { data } = $props<{ data: PageData }>();

	const STATUS_BADGE: Record<string, string> = {
		draft:    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
		approved: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
	};

	const PLATFORMS: { value: PostPlatform; label: string }[] = [
		{ value: 'instagram_feed',    label: 'Instagram Feed'    },
		{ value: 'instagram_stories', label: 'Instagram Stories' },
		{ value: 'instagram_reels',   label: 'Instagram Reels'   },
		{ value: 'linkedin',          label: 'LinkedIn'          },
		{ value: 'facebook',          label: 'Facebook'          },
	];

	// ── Create modal ──────────────────────────────────────────────────────────
	let showCreate  = $state(false);
	let newTitle    = $state('');
	let newContent  = $state('');
	let newHashtags = $state('');
	let isCreating  = $state(false);

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
			const tags = newHashtags.split(/\s+/).map(t => t.trim()).filter(Boolean);

			const res = await fetch(`/api/posts/${data.tenant}/import`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ workflow: {}, result: { id, status: 'draft', title: newTitle, content: newContent, hashtags: tags, media_type: 'image' } }),
			});
			if (res.ok) { showCreate = false; window.location.reload(); }
		} finally { isCreating = false; }
	}

	// ── Edit modal ────────────────────────────────────────────────────────────
	let editingPost    = $state<PostWithMeta | null>(null);
	let editTitle      = $state('');
	let editContent    = $state('');
	let editHashtags   = $state('');
	let isSavingEdit   = $state(false);

	function openEdit(post: PostWithMeta) {
		editingPost  = post;
		editTitle    = post.title;
		editContent  = post.content;
		editHashtags = post.hashtags?.join(' ') ?? '';
	}

	async function saveEdit() {
		if (!editingPost || !editTitle.trim() || !editContent.trim()) return;
		isSavingEdit = true;
		try {
			const tags = editHashtags.split(/\s+/).map(t => t.trim()).filter(Boolean);
			await fetch(`/api/posts/${data.tenant}/${editingPost.filename}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: editTitle, content: editContent, hashtags: tags }),
			});
			editingPost.title    = editTitle;
			editingPost.content  = editContent;
			editingPost.hashtags = tags;
			data.drafts = [...data.drafts];
			editingPost = null;
		} finally { isSavingEdit = false; }
	}

	// ── Schedule modal ────────────────────────────────────────────────────────
	let schedulingPost = $state<PostWithMeta | null>(null);
	let schedDate      = $state('');
	let schedTime      = $state('10:00');
	let schedPlatform  = $state<PostPlatform>('instagram_feed');
	let isSavingSched  = $state(false);

	function openSchedule(post: PostWithMeta) {
		schedulingPost = post;
		schedDate      = '';
		schedTime      = '10:00';
		schedPlatform  = post.platform ?? 'instagram_feed';
	}

	async function saveSchedule() {
		if (!schedulingPost || !schedDate) return;
		isSavingSched = true;
		try {
			await fetch(`/api/posts/${data.tenant}/${schedulingPost.filename}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'scheduled', scheduled_date: schedDate, scheduled_time: schedTime || undefined, platform: schedPlatform }),
			});
			data.drafts = data.drafts.filter(p => p.id !== schedulingPost!.id);
			schedulingPost = null;
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
			data.drafts = [...data.drafts];
		} finally { approvingId = null; }
	}
</script>

<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">

	<!-- Header -->
	<div class="flex items-center justify-between mb-6">
		<div>
			<div class="flex items-center gap-2 mb-0.5">
				<FileEdit class="w-5 h-5 text-slate-400" />
				<h2 class="text-xl font-bold text-slate-900 dark:text-white">Drafts</h2>
				<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
					{data.drafts.length}
				</span>
			</div>
			<p class="text-sm text-slate-500 dark:text-slate-400">
				Posts without a scheduled date. Approve and schedule to add to the planner.
			</p>
		</div>
		<button
			onclick={openCreate}
			class="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
		>
			<Plus class="w-4 h-4" /> New Draft
		</button>
	</div>

	{#if data.drafts.length === 0}
		<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-16 text-center">
			<FileEdit class="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
			<p class="text-slate-500 dark:text-slate-400 text-sm mb-3">No drafts yet.</p>
			<button onclick={openCreate} class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
				Create your first draft
			</button>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each data.drafts as post (post.id)}
				<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex items-start gap-4">

					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 mb-2 flex-wrap">
							<span class="text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide {STATUS_BADGE[post.status] ?? STATUS_BADGE.draft}">
								{post.status}
							</span>
							<span class="text-xs text-slate-400 font-mono truncate">{post.id}</span>
						</div>
						<p class="font-semibold text-slate-900 dark:text-white mb-1">{post.title}</p>
						<p class="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{post.content}</p>
					</div>

					<div class="flex items-center gap-2 shrink-0">
						<!-- Edit -->
						<button
							onclick={() => openEdit(post)}
							title="Edit"
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
						>
							<Pencil class="w-3.5 h-3.5" /> Edit
						</button>

						<!-- Approve toggle -->
						<button
							onclick={() => toggleApprove(post)}
							disabled={approvingId === post.id}
							title={post.status === 'approved' ? 'Unapprove' : 'Approve'}
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50
								{post.status === 'approved'
									? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
									: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-300 hover:text-emerald-700'}"
						>
							<Check class="w-3.5 h-3.5" />
							{post.status === 'approved' ? 'Approved' : 'Approve'}
						</button>

						<!-- Schedule (only if approved) -->
						<button
							onclick={() => openSchedule(post)}
							disabled={post.status !== 'approved'}
							title={post.status !== 'approved' ? 'Approve first' : 'Schedule'}
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
								{post.status === 'approved'
									? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100'
									: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed opacity-50'}"
						>
							<CalendarPlus class="w-3.5 h-3.5" /> Schedule
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Create modal -->
{#if showCreate}
	<div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onclick={() => showCreate = false} onkeydown={e => e.key === 'Escape' && (showCreate = false)} role="dialog" aria-modal="true" tabindex="-1">
		<div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 relative" onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()} role="presentation">
			<button onclick={() => showCreate = false} class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"><X class="w-4 h-4" /></button>
			<h3 class="text-lg font-bold text-slate-900 dark:text-white mb-5">New Draft</h3>
			<div class="flex flex-col gap-4">
				<div>
					<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Title</label>
					<input bind:value={newTitle} type="text" placeholder="Post title" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
				</div>
				<div>
					<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Content</label>
					<textarea bind:value={newContent} rows="5" placeholder="Post copy..." class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
				</div>
				<div>
					<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Hashtags <span class="font-normal normal-case text-slate-400">(space separated)</span></label>
					<input bind:value={newHashtags} type="text" placeholder="#hashtag1 #hashtag2" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
				</div>
			</div>
			<div class="flex gap-3 mt-6">
				<button onclick={createDraft} disabled={!newTitle.trim() || !newContent.trim() || isCreating} class="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
					{isCreating ? 'Creating...' : 'Create Draft'}
				</button>
				<button onclick={() => showCreate = false} class="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
			</div>
		</div>
	</div>
{/if}

<!-- Edit modal -->
{#if editingPost}
	<div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onclick={() => editingPost = null} onkeydown={e => e.key === 'Escape' && (editingPost = null)} role="dialog" aria-modal="true" tabindex="-1">
		<div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 relative" onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()} role="presentation">
			<button onclick={() => editingPost = null} class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"><X class="w-4 h-4" /></button>
			<h3 class="text-lg font-bold text-slate-900 dark:text-white mb-5">Edit Draft</h3>
			<div class="flex flex-col gap-4">
				<div>
					<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Title</label>
					<input bind:value={editTitle} type="text" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
				</div>
				<div>
					<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Content</label>
					<textarea bind:value={editContent} rows="6" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
				</div>
				<div>
					<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Hashtags <span class="font-normal normal-case text-slate-400">(space separated)</span></label>
					<input bind:value={editHashtags} type="text" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
				</div>
			</div>
			<div class="flex gap-3 mt-6">
				<button onclick={saveEdit} disabled={!editTitle.trim() || !editContent.trim() || isSavingEdit} class="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
					{isSavingEdit ? 'Saving...' : 'Save Changes'}
				</button>
				<button onclick={() => editingPost = null} class="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
			</div>
		</div>
	</div>
{/if}

<!-- Schedule modal -->
{#if schedulingPost}
	<div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onclick={() => schedulingPost = null} onkeydown={e => e.key === 'Escape' && (schedulingPost = null)} role="dialog" aria-modal="true" tabindex="-1">
		<div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 relative" onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()} role="presentation">
			<button onclick={() => schedulingPost = null} class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"><X class="w-4 h-4" /></button>
			<h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">Schedule Post</h3>
			<p class="text-sm text-slate-500 mb-5 truncate">{schedulingPost.title}</p>
			<div class="flex flex-col gap-4">
				<div>
					<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Platform</label>
					<select bind:value={schedPlatform} class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
						{#each PLATFORMS as p}<option value={p.value}>{p.label}</option>{/each}
					</select>
				</div>
				<div>
					<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Date</label>
					<input type="date" bind:value={schedDate} min={new Date().toISOString().slice(0,10)} class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
				</div>
				<div>
					<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Time <span class="font-normal normal-case text-slate-400">(optional)</span></label>
					<input type="time" bind:value={schedTime} class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
				</div>
			</div>
			<div class="flex gap-3 mt-6">
				<button onclick={saveSchedule} disabled={!schedDate || isSavingSched} class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
					<Clock class="w-4 h-4" /> {isSavingSched ? 'Saving...' : 'Add to Planner'}
				</button>
				<button onclick={() => schedulingPost = null} class="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
			</div>
		</div>
	</div>
{/if}
