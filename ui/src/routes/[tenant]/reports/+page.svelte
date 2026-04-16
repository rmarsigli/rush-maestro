<script lang="ts">
	import { FileText } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();

	const COLOR_CLASSES: Record<string, { badge: string; dot: string }> = {
		amber:   { badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',   dot: 'bg-amber-400'   },
		blue:    { badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',       dot: 'bg-blue-400'    },
		emerald: { badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400' },
		violet:  { badge: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300', dot: 'bg-violet-400' },
		red:     { badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',           dot: 'bg-red-400'     },
		slate:   { badge: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',      dot: 'bg-slate-400'   },
	};
</script>

<div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">

	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3 mb-1">
			<FileText class="w-6 h-6 text-slate-400" />
			<h2 class="text-2xl font-bold text-slate-900 dark:text-white">Reports</h2>
		</div>
		<p class="text-sm text-slate-500 dark:text-slate-400 ml-9">
			{data.reports.length} {data.reports.length === 1 ? 'report' : 'reports'} available
		</p>
	</div>

	{#if data.reports.length === 0}
		<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
			<FileText class="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
			<p class="text-slate-500 dark:text-slate-400 text-sm">No reports found for this client.</p>
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each data.reports as report}
				{@const colors = COLOR_CLASSES[report.color] ?? COLOR_CLASSES.slate}
				<a
					href="/{data.tenant}/reports/{report.slug}"
					class="group flex items-start gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all"
				>
					<!-- Icon dot -->
					<div class="mt-0.5 w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/20 transition-colors">
						<span class="w-2.5 h-2.5 rounded-full {colors.dot}"></span>
					</div>

					<!-- Content -->
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 flex-wrap mb-1">
							<span class="text-xs font-semibold px-2 py-0.5 rounded-full {colors.badge}">
								{report.label}
							</span>
							{#if report.date}
								<time class="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{report.date}</time>
							{/if}
						</div>
						<p class="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
							{report.title || report.slug}
						</p>
						<p class="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-mono truncate">{report.slug}</p>
					</div>

					<!-- Arrow -->
					<span class="text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors text-lg leading-none mt-1">›</span>
				</a>
			{/each}
		</div>
	{/if}
</div>
