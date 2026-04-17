<script lang="ts">
	import { ChevronLeft, ChevronRight, Plus, X, Clock } from 'lucide-svelte';
	import type { PageData } from './$types';
	import type { PostWithMeta, PostPlatform } from '$lib/server/db';

	let { data } = $props<{ data: PageData }>();

	// ── Calendar state ────────────────────────────────────────────────────────
	const today = new Date();
	let viewYear  = $state(today.getFullYear());
	let viewMonth = $state(today.getMonth());

	const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
	const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

	const calendarCells = $derived.by(() => {
		const firstDay = new Date(viewYear, viewMonth, 1).getDay();
		const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
		const cells: Array<{ date: string | null; day: number | null }> = [];
		for (let i = 0; i < firstDay; i++) cells.push({ date: null, day: null });
		for (let d = 1; d <= daysInMonth; d++) {
			const mm = String(viewMonth + 1).padStart(2, '0');
			const dd = String(d).padStart(2, '0');
			cells.push({ date: `${viewYear}-${mm}-${dd}`, day: d });
		}
		while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
		return cells;
	});

	// Local scheduled list (updated optimistically on create)
	let scheduled = $state<PostWithMeta[]>(data.scheduled);

	const postsByDate = $derived.by(() => {
		const map = new Map<string, PostWithMeta[]>();
		for (const p of scheduled) {
			if (!p.scheduled_date) continue;
			if (!map.has(p.scheduled_date)) map.set(p.scheduled_date, []);
			map.get(p.scheduled_date)!.push(p);
		}
		return map;
	});

	function prevMonth() { if (viewMonth === 0) { viewMonth = 11; viewYear--; } else viewMonth--; }
	function nextMonth() { if (viewMonth === 11) { viewMonth = 0; viewYear++; } else viewMonth++; }
	function isToday(date: string | null) { return date === today.toISOString().slice(0, 10); }

	// ── Platform config ───────────────────────────────────────────────────────
	const PLATFORM: Record<PostPlatform, { label: string; color: string }> = {
		instagram_feed:    { label: 'IG Feed',    color: 'bg-pink-500'   },
		instagram_stories: { label: 'IG Stories', color: 'bg-purple-500' },
		instagram_reels:   { label: 'IG Reels',   color: 'bg-rose-500'   },
		linkedin:          { label: 'LinkedIn',   color: 'bg-blue-600'   },
		facebook:          { label: 'Facebook',   color: 'bg-blue-500'   },
	};

	const PLATFORMS: { value: PostPlatform; label: string }[] = Object.entries(PLATFORM).map(
		([value, { label }]) => ({ value: value as PostPlatform, label })
	);

	// ── Detail modal ──────────────────────────────────────────────────────────
	let selectedPost = $state<PostWithMeta | null>(null);

	// ── New post modal (from calendar day "+") ────────────────────────────────
	let newPostDate     = $state<string | null>(null); // null = closed
	let newTitle        = $state('');
	let newContent      = $state('');
	let newHashtags     = $state('');
	let newTime         = $state('10:00');
	let newPlatform     = $state<PostPlatform>('instagram_feed');
	let isCreating      = $state(false);

	function openNewPost(date: string) {
		newPostDate = date;
		newTitle = ''; newContent = ''; newHashtags = '';
		newTime = '10:00'; newPlatform = 'instagram_feed';
	}

	async function createPost() {
		if (!newPostDate || !newTitle.trim() || !newContent.trim()) return;
		isCreating = true;
		try {
			const slug = newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
			const id   = `${newPostDate}_${slug || 'post'}`;
			const tags = newHashtags.split(/\s+/).map(t => t.trim()).filter(Boolean);

			const res = await fetch(`/api/posts/${data.tenant}/import`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					workflow: {},
					result: {
						id,
						status: 'scheduled',
						title:          newTitle,
						content:        newContent,
						hashtags:       tags,
						media_type:     'image',
						scheduled_date: newPostDate,
						scheduled_time: newTime || undefined,
						platform:       newPlatform,
					},
				}),
			});

			if (res.ok) {
				// Optimistic update — add to local list without reload
				const fakePost: PostWithMeta = {
					id, status: 'scheduled', title: newTitle, content: newContent,
					hashtags: tags, media_type: 'image',
					scheduled_date: newPostDate, scheduled_time: newTime || undefined,
					platform: newPlatform,
					client_id: data.tenant, filename: `${id}.json`, media_files: [], workflow: {},
				};
				scheduled = [...scheduled, fakePost];
				newPostDate = null;
			}
		} finally { isCreating = false; }
	}
</script>

<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">

	<!-- Calendar header -->
	<div class="flex items-center justify-between mb-6">
		<h2 class="text-xl font-bold text-slate-900 dark:text-white">
			{MONTHS[viewMonth]} {viewYear}
		</h2>
		<div class="flex items-center gap-1">
			<button onclick={prevMonth} class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
				<ChevronLeft class="w-5 h-5" />
			</button>
			<button onclick={() => { viewYear = today.getFullYear(); viewMonth = today.getMonth(); }} class="px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
				Today
			</button>
			<button onclick={nextMonth} class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
				<ChevronRight class="w-5 h-5" />
			</button>
		</div>
	</div>

	<!-- Day headers -->
	<div class="grid grid-cols-7 mb-1">
		{#each DAYS as d}
			<div class="text-center text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider py-2">{d}</div>
		{/each}
	</div>

	<!-- Calendar grid -->
	<div class="grid grid-cols-7 border-l border-t border-slate-200 dark:border-slate-800">
		{#each calendarCells as cell}
			{@const posts = cell.date ? (postsByDate.get(cell.date) ?? []) : []}
			<div
				class="border-r border-b border-slate-200 dark:border-slate-800 min-h-[110px] p-1.5 relative group/cell
					{cell.date ? 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40' : 'bg-slate-50 dark:bg-slate-950'}"
			>
				{#if cell.day}
					<!-- Day number + "+" button -->
					<div class="flex items-center justify-between mb-1 px-0.5">
						<span class="text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full
							{isToday(cell.date) ? 'bg-indigo-500 text-white' : 'text-slate-500 dark:text-slate-400'}">
							{cell.day}
						</span>
						<button
							onclick={() => openNewPost(cell.date!)}
							class="opacity-0 group-hover/cell:opacity-100 transition-opacity w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
							title="Add post for {cell.date}"
						>
							<Plus class="w-3.5 h-3.5" />
						</button>
					</div>

					<!-- Posts -->
					<div class="flex flex-col gap-0.5">
						{#each posts.slice(0, 3) as post (post.id)}
							<button
								onclick={() => selectedPost = post}
								class="w-full text-left rounded px-1.5 py-0.5 flex items-center gap-1.5 hover:opacity-80 transition-opacity"
								style="background: {post.status === 'published' ? 'rgb(220 252 231)' : 'rgb(254 243 199)'}"
							>
								{#if post.platform && PLATFORM[post.platform]}
									<span class="w-1.5 h-1.5 rounded-full shrink-0 {PLATFORM[post.platform].color}"></span>
								{/if}
								<span class="text-[10px] font-medium truncate text-slate-700">{post.title}</span>
							</button>
						{/each}
						{#if posts.length > 3}
							<span class="text-[10px] text-slate-400 pl-1">+{posts.length - 3} more</span>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Legend -->
	<div class="flex items-center gap-4 mt-4 text-xs text-slate-500 flex-wrap">
		<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-sm bg-amber-100 border border-amber-300"></span> Scheduled</span>
		<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-sm bg-emerald-100 border border-emerald-300"></span> Published</span>
		{#each Object.entries(PLATFORM) as [, val]}
			<span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full {val.color}"></span> {val.label}</span>
		{/each}
	</div>
</div>

<!-- New post modal (calendar day "+") -->
{#if newPostDate}
	<div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onclick={() => newPostDate = null} onkeydown={e => e.key === 'Escape' && (newPostDate = null)} role="dialog" aria-modal="true" tabindex="-1">
		<div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 relative" onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()} role="presentation">
			<button onclick={() => newPostDate = null} class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"><X class="w-4 h-4" /></button>
			<h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">New Post</h3>
			<p class="text-xs text-slate-400 font-mono mb-5">{newPostDate}</p>

			<div class="flex flex-col gap-4">
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Platform</label>
						<select bind:value={newPlatform} class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
							{#each PLATFORMS as p}<option value={p.value}>{p.label}</option>{/each}
						</select>
					</div>
					<div>
						<label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Time <span class="font-normal normal-case text-slate-400">(optional)</span></label>
						<input type="time" bind:value={newTime} class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
					</div>
				</div>
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
				<button onclick={createPost} disabled={!newTitle.trim() || !newContent.trim() || isCreating} class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
					<Clock class="w-4 h-4" /> {isCreating ? 'Saving...' : 'Add to Planner'}
				</button>
				<button onclick={() => newPostDate = null} class="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
			</div>
		</div>
	</div>
{/if}

<!-- Post detail modal -->
{#if selectedPost}
	<div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onclick={() => selectedPost = null} onkeydown={e => e.key === 'Escape' && (selectedPost = null)} role="dialog" aria-modal="true" tabindex="-1">
		<div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 relative" onclick={e => e.stopPropagation()} onkeydown={e => e.stopPropagation()} role="presentation">
			<button onclick={() => selectedPost = null} class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"><X class="w-4 h-4" /></button>
			<div class="flex items-start justify-between gap-4 mb-4 pr-6">
				<div>
					<p class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
						{selectedPost.platform ? PLATFORM[selectedPost.platform]?.label : '—'}
						{#if selectedPost.scheduled_date}· {selectedPost.scheduled_date}{selectedPost.scheduled_time ? ' ' + selectedPost.scheduled_time : ''}{/if}
					</p>
					<h3 class="text-lg font-bold text-slate-900 dark:text-white">{selectedPost.title}</h3>
				</div>
				<span class="text-xs px-2 py-0.5 rounded-full font-bold uppercase shrink-0 {selectedPost.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
					{selectedPost.status}
				</span>
			</div>
			<p class="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed mb-4">{selectedPost.content}</p>
			{#if selectedPost.hashtags?.length}
				<p class="text-xs text-indigo-500 dark:text-indigo-400 flex flex-wrap gap-1">
					{#each selectedPost.hashtags as tag}<span>{tag}</span>{/each}
				</p>
			{/if}
		</div>
	</div>
{/if}
