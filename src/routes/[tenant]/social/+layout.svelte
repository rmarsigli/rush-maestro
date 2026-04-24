<script lang="ts">
	import { page } from '$app/stores';
	import { CalendarDays, FileEdit } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	let { children } = $props<{ children: Snippet }>();
	let currentPath = $derived($page.url.pathname);
	let isDrafts = $derived(currentPath.includes('/drafts'));
</script>

<div class="flex flex-col flex-1 min-h-0">
	<!-- Sub-nav -->
	<div class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8">
		<div class="flex items-center gap-1 -mb-px">
			<a
				href="{$page.params.tenant ? `/${$page.params.tenant}/social` : '/social'}"
				class="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors {!isDrafts
					? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
					: 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}"
			>
				<CalendarDays class="w-4 h-4" /> Planner
			</a>
			<a
				href="{$page.params.tenant ? `/${$page.params.tenant}/social/drafts` : '/social/drafts'}"
				class="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors {isDrafts
					? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
					: 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}"
			>
				<FileEdit class="w-4 h-4" /> Drafts
			</a>
		</div>
	</div>

	{@render children()}
</div>
