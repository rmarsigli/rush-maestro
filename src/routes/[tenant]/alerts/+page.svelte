<script lang="ts">
	import { untrack } from 'svelte';
	import { Bell, CheckCircle, EyeOff, AlertTriangle, AlertOctagon, Clock, Inbox } from 'lucide-svelte';
	import type { PageData } from './$types';
	import type { AlertEventRow } from '$db/alerts';

	let { data } = $props<{ data: PageData }>();

	let openAlerts = $state<AlertEventRow[]>(untrack(() => data.alerts));
	$effect(() => { openAlerts = data.alerts; });
	let busy = $state(new Set<number>());

	let criticals = $derived(openAlerts.filter(a => a.level === 'CRITICAL'));
	let warns = $derived(openAlerts.filter(a => a.level === 'WARN'));

	async function dismiss(id: number, action: 'resolved' | 'ignored') {
		busy = new Set([...busy, id]);
		try {
			const res = await fetch(`/api/alerts/${data.tenant}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, action }),
			});
			if (res.ok) {
				openAlerts = openAlerts.filter(a => a.id !== id);
			}
		} finally {
			const next = new Set(busy);
			next.delete(id);
			busy = next;
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
			day: '2-digit', month: 'short', year: 'numeric',
		});
	}

	function formatCreatedAt(ts: string): string {
		return new Date(ts).toLocaleString('en-GB', {
			day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
		});
	}

	function resolvedLabel(resolved: number): string {
		if (resolved === 1) return 'Resolved';
		if (resolved === 2) return 'Ignored';
		return '';
	}

	function typeLabel(type: string): string {
		const map: Record<string, string> = {
			no_conversions_streak: 'No Conversions',
			high_cpa:              'High CPA',
			budget_underpace:      'Budget Underpace',
			low_impressions:       'Low Impressions',
		};
		return map[type] ?? type;
	}
</script>

<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">

	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3 mb-1">
			<Bell class="w-6 h-6 text-slate-400" />
			<h2 class="text-2xl font-bold text-slate-900 dark:text-white">Alerts</h2>
			{#if openAlerts.length > 0}
				<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
					{openAlerts.length} open
				</span>
			{/if}
		</div>
		<p class="text-sm text-slate-500 dark:text-slate-400 ml-9">
			Automatic alerts from daily monitoring
		</p>
	</div>

	<!-- Empty state -->
	{#if openAlerts.length === 0 && data.history.length === 0}
		<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-16 text-center">
			<Inbox class="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
			<p class="font-medium text-slate-500 dark:text-slate-400">No alerts yet</p>
			<p class="text-sm text-slate-400 dark:text-slate-500 mt-1">Daily monitoring populates this inbox automatically.</p>
		</div>

	{:else}
		<!-- OPEN ALERTS -->
		{#if openAlerts.length === 0}
			<div class="rounded-xl border border-dashed border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 p-6 text-center mb-8">
				<CheckCircle class="w-8 h-8 text-emerald-400 mx-auto mb-2" />
				<p class="text-sm font-medium text-emerald-700 dark:text-emerald-400">All clear — no open alerts.</p>
			</div>
		{:else}
			<!-- CRITICAL -->
			{#if criticals.length > 0}
				<section class="mb-6">
					<div class="flex items-center gap-2 mb-3">
						<AlertOctagon class="w-4 h-4 text-red-500" />
						<h3 class="text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
							Critical ({criticals.length})
						</h3>
					</div>
					<div class="flex flex-col gap-3">
						{#each criticals as alert (alert.id)}
							<div class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4">
								<div class="flex items-start justify-between gap-4">
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2 flex-wrap mb-1">
											<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
												{typeLabel(alert.type)}
											</span>
											<span class="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
												{formatDate(alert.date)}
											</span>
											<span class="text-xs text-slate-400 dark:text-slate-500 font-mono">
												cmp. {alert.campaign_id}
											</span>
										</div>
										<p class="text-sm font-semibold text-red-800 dark:text-red-200">{alert.message}</p>
										{#if alert.action_suggested}
											<p class="text-xs text-red-600 dark:text-red-400 mt-1 flex items-start gap-1">
												<span class="shrink-0 mt-0.5">→</span>
												<span>{alert.action_suggested}</span>
											</p>
										{/if}
									</div>
									<div class="flex items-center gap-2 shrink-0">
										<button
											onclick={() => dismiss(alert.id, 'resolved')}
											disabled={busy.has(alert.id)}
											class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:border-emerald-700 dark:hover:text-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<CheckCircle class="w-3.5 h-3.5" /> Resolve
										</button>
										<button
											onclick={() => dismiss(alert.id, 'ignored')}
											disabled={busy.has(alert.id)}
											class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<EyeOff class="w-3.5 h-3.5" /> Ignore
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- WARN -->
			{#if warns.length > 0}
				<section class="mb-6">
					<div class="flex items-center gap-2 mb-3">
						<AlertTriangle class="w-4 h-4 text-amber-500" />
						<h3 class="text-sm font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
							Warning ({warns.length})
						</h3>
					</div>
					<div class="flex flex-col gap-3">
						{#each warns as alert (alert.id)}
							<div class="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-4">
								<div class="flex items-start justify-between gap-4">
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2 flex-wrap mb-1">
											<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
												{typeLabel(alert.type)}
											</span>
											<span class="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
												{formatDate(alert.date)}
											</span>
											<span class="text-xs text-slate-400 dark:text-slate-500 font-mono">
												cmp. {alert.campaign_id}
											</span>
										</div>
										<p class="text-sm font-semibold text-amber-800 dark:text-amber-200">{alert.message}</p>
										{#if alert.action_suggested}
											<p class="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-start gap-1">
												<span class="shrink-0 mt-0.5">→</span>
												<span>{alert.action_suggested}</span>
											</p>
										{/if}
									</div>
									<div class="flex items-center gap-2 shrink-0">
										<button
											onclick={() => dismiss(alert.id, 'resolved')}
											disabled={busy.has(alert.id)}
											class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:border-emerald-700 dark:hover:text-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<CheckCircle class="w-3.5 h-3.5" /> Resolve
										</button>
										<button
											onclick={() => dismiss(alert.id, 'ignored')}
											disabled={busy.has(alert.id)}
											class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<EyeOff class="w-3.5 h-3.5" /> Ignore
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/if}

		<!-- HISTORY -->
		{#if data.history.length > 0}
			<section>
				<div class="flex items-center gap-2 mb-3 mt-2">
					<Clock class="w-4 h-4 text-slate-400" />
					<h3 class="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
						History
					</h3>
				</div>
				<div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
					{#each data.history as alert (alert.id)}
						{@const isOpen = alert.resolved === 0}
						<div class="flex items-center gap-3 px-4 py-3 {isOpen ? '' : 'opacity-50'}">
							<!-- Level dot -->
							<span class="w-2 h-2 rounded-full shrink-0 {alert.level === 'CRITICAL' ? 'bg-red-400' : 'bg-amber-400'}"></span>

							<!-- Type -->
							<span class="text-xs text-slate-500 dark:text-slate-400 font-medium w-32 shrink-0 truncate">
								{typeLabel(alert.type)}
							</span>

							<!-- Message -->
							<span class="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate">{alert.message}</span>

							<!-- Date -->
							<span class="text-xs text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
								{formatDate(alert.date)}
							</span>

							<!-- Status badge -->
							{#if !isOpen}
								<span class="text-xs px-2 py-0.5 rounded-full {alert.resolved === 1 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'} shrink-0">
									{resolvedLabel(alert.resolved)}
								</span>
							{:else}
								<span class="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 shrink-0">
									Open
								</span>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</div>
