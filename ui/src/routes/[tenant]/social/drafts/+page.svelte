<script lang="ts">
	import { FileEdit, CalendarPlus, Check, Clock } from 'lucide-svelte';
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

	// ── Schedule modal ────────────────────────────────────────────────────────
	let schedulingPost = $state<PostWithMeta | null>(null);
	let schedDate     = $state('');
	let schedTime     = $state('10:00');
	let schedPlatform = $state<PostPlatform>('instagram_feed');
	let isSaving      = $state(false);

	function openSchedule(post: PostWithMeta) {
		schedulingPost = post;
		schedDate      = '';
		schedTime      = '10:00';
		schedPlatform  = post.platform ?? 'instagram_feed';
	}

	async function saveSchedule() {
		if (!schedulingPost || !schedDate) return;
		isSaving = true;
		try {
			await fetch(`/api/posts/${data.tenant}/${schedulingPost.filename}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					status: 'scheduled',
					scheduled_date: schedDate,
					scheduled_time: schedTime || undefined,
					platform: schedPlatform,
				}),
			});
			// Remove from list optimistically
			data.drafts = data.drafts.filter(p => p.id !== schedulingPost!.id);
			schedulingPost = null;
		} finally {
			isSaving = false;
		}
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
			data.drafts = [...data.drafts]; // trigger reactivity
		} finally {
			approvingId = null;
		}
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
	</div>

	{#if data.drafts.length === 0}
		<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-16 text-center">
			<FileEdit class="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
			<p class="text-slate-500 dark:text-slate-400 text-sm">No drafts. All posts are scheduled.</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each data.drafts as post (post.id)}
				<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex items-start gap-4">

					<!-- Status badge + content -->
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 mb-2 flex-wrap">
							<span class="text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide {STATUS_BADGE[post.status] ?? STATUS_BADGE.draft}">
								{post.status}
							</span>
							<span class="text-xs text-slate-400 font-mono">{post.id}</span>
						</div>
						<p class="font-semibold text-slate-900 dark:text-white mb-1">{post.title}</p>
						<p class="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{post.content}</p>
					</div>

					<!-- Actions -->
					<div class="flex items-center gap-2 shrink-0">
						<!-- Approve toggle -->
						<button
							onclick={() => toggleApprove(post)}
							disabled={approvingId === post.id}
							title={post.status === 'approved' ? 'Mark as draft' : 'Approve'}
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50
								{post.status === 'approved'
									? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
									: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-300 hover:text-emerald-700'}"
						>
							<Check class="w-3.5 h-3.5" />
							{post.status === 'approved' ? 'Approved' : 'Approve'}
						</button>

						<!-- Schedule button (only if approved) -->
						<button
							onclick={() => openSchedule(post)}
							disabled={post.status !== 'approved'}
							title={post.status !== 'approved' ? 'Approve first to schedule' : 'Schedule'}
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
								{post.status === 'approved'
									? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100'
									: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed opacity-50'}"
						>
							<CalendarPlus class="w-3.5 h-3.5" />
							Schedule
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Schedule modal -->
{#if schedulingPost}
	<div
		class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
		onclick={() => schedulingPost = null}
		onkeydown={e => e.key === 'Escape' && (schedulingPost = null)}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div
			class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6"
			onclick={e => e.stopPropagation()}
			onkeydown={e => e.stopPropagation()}
			role="presentation"
		>
			<h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">Schedule Post</h3>
			<p class="text-sm text-slate-500 mb-5 truncate">{schedulingPost.title}</p>

			<div class="flex flex-col gap-4">
				<!-- Platform -->
				<div>
					<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Platform</label>
					<select
						bind:value={schedPlatform}
						class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
					>
						{#each PLATFORMS as p}
							<option value={p.value}>{p.label}</option>
						{/each}
					</select>
				</div>

				<!-- Date -->
				<div>
					<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Date</label>
					<input
						type="date"
						bind:value={schedDate}
						min={new Date().toISOString().slice(0, 10)}
						class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</div>

				<!-- Time -->
				<div>
					<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Time <span class="font-normal normal-case text-slate-400">(optional)</span></label>
					<input
						type="time"
						bind:value={schedTime}
						class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</div>
			</div>

			<div class="flex items-center gap-3 mt-6">
				<button
					onclick={saveSchedule}
					disabled={!schedDate || isSaving}
					class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<Clock class="w-4 h-4" />
					{isSaving ? 'Saving...' : 'Add to Planner'}
				</button>
				<button
					onclick={() => schedulingPost = null}
					class="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}
