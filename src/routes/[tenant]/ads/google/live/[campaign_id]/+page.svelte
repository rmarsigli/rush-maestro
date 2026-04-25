<script lang="ts">
	import type { PageData } from './$types';
	import type { HistoryEntry } from '$lib/server/googleAdsDetailed';
	import type { DbHistoryDay } from './+page.server';
	import {
		ArrowLeft, Download, Target, DollarSign, Activity, ActivityIcon,
		Play, Pause, BarChart2, MousePointerClick, Loader2,
		TrendingUp, TrendingDown, Minus, AlertTriangle, AlertOctagon,
		CalendarDays, Gauge
	} from 'lucide-svelte';
	import { Chart, registerables } from 'chart.js';
	import { goto } from '$app/navigation';
	import { navigating } from '$app/stores';

	Chart.register(...registerables);

	let { data } = $props<{ data: PageData }>();

	let exporting       = $state(false);
	let chartCanvas    = $state<HTMLCanvasElement | undefined>(undefined);
	let historyCanvas  = $state<HTMLCanvasElement | undefined>(undefined);
	let chartInstance:  Chart | null = null;
	let historyChart:   Chart | null = null;

	let isLoadingPeriod = $derived(!!$navigating);

	// ── Week-over-week deltas ────────────────────────────────────────────────

	function wowDelta(cur: number, prev: number, lowerIsBetter = false) {
		if (prev === 0) return { pct: '—', dir: 'flat' as const };
		const d = ((cur - prev) / prev) * 100;
		if (Math.abs(d) < 1) return { pct: '~0%', dir: 'flat' as const };
		const pct = (d > 0 ? '+' : '') + d.toFixed(0) + '%';
		const positive = lowerIsBetter ? d < 0 : d > 0;
		return { pct, dir: positive ? ('up' as const) : ('down' as const) };
	}

	const deltas = $derived({
		impressions: wowDelta(data.wow.cur.impressions, data.wow.prev.impressions),
		clicks:      wowDelta(data.wow.cur.clicks,      data.wow.prev.clicks),
		cost:        wowDelta(data.wow.cur.cost,         data.wow.prev.cost, true),
		conversions: wowDelta(data.wow.cur.conversions,  data.wow.prev.conversions),
	});

	// ── API chart (existing) ─────────────────────────────────────────────────

	$effect(() => {
		if (chartCanvas && data.campaign.history?.length > 0) {
			chartInstance?.destroy();
			chartInstance = new Chart(chartCanvas, {
				type: 'line',
				data: {
					labels:   data.campaign.history.map((h: HistoryEntry) => h.date),
					datasets: [
						{
							label: 'Clicks',
							data:  data.campaign.history.map((h: HistoryEntry) => h.clicks),
							borderColor: '#3b82f6',
							backgroundColor: 'rgba(59,130,246,0.1)',
							yAxisID: 'y', tension: 0.4, fill: true,
						},
						{
							label: 'Impressions',
							data:  data.campaign.history.map((h: HistoryEntry) => h.impressions),
							borderColor: '#8b5cf6',
							backgroundColor: 'transparent',
							yAxisID: 'y1', tension: 0.4, borderDash: [5, 5],
						},
					],
				},
				options: {
					responsive: true, maintainAspectRatio: false,
					interaction: { mode: 'index', intersect: false },
					scales: {
						y:  { type: 'linear', position: 'left',  title: { display: true, text: 'Clicks' } },
						y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Impressions' } },
					},
				},
			});
		}
	});

	// ── Historical chart (SQLite — 30 days) ──────────────────────────────────

	$effect(() => {
		if (historyCanvas && data.dbHistory.length > 0) {
			historyChart?.destroy();

			const days       = data.dbHistory;
			const labels     = days.map((d: DbHistoryDay) => d.date.substring(5)); // MM-DD
			const costs      = days.map((d: DbHistoryDay) => d.cost);
			const cpaPoints  = days.map((d: DbHistoryDay) => d.conversions > 0 ? d.cpa : null);

			historyChart = new Chart(historyCanvas, {
				data: {
					labels,
					datasets: [
						{
							type: 'bar',
							label: 'Cost (R$)',
							data: costs,
							backgroundColor: 'rgba(99,102,241,0.6)',
							borderColor: '#6366f1',
							borderWidth: 1,
							yAxisID: 'yCost',
						},
						{
							type: 'line',
							label: 'CPA (R$)',
							data: cpaPoints,
							borderColor: '#f59e0b',
							backgroundColor: 'transparent',
							pointBackgroundColor: '#f59e0b',
							pointRadius: 4,
							tension: 0.3,
							yAxisID: 'yCpa',
							spanGaps: false,
						},
					],
				},
				options: {
					responsive: true, maintainAspectRatio: false,
					interaction: { mode: 'index', intersect: false },
					plugins: {
						tooltip: {
							callbacks: {
								label: ctx => {
									if (ctx.dataset.label === 'Cost (R$)') return `Cost: R$${Number(ctx.raw).toFixed(2)}`;
									if (ctx.dataset.label === 'CPA (R$)' && ctx.raw != null) return `CPA: R$${Number(ctx.raw).toFixed(2)}`;
									return '';
								},
							},
						},
					},
					scales: {
						yCost: {
							type: 'linear', position: 'left',
							title: { display: true, text: 'Cost (R$)' },
							beginAtZero: true,
						},
						yCpa: {
							type: 'linear', position: 'right',
							title: { display: true, text: 'CPA (R$)' },
							grid: { drawOnChartArea: false },
							beginAtZero: true,
						},
					},
				},
			});
		}
	});

	// ── Actions ──────────────────────────────────────────────────────────────

	async function exportReport() {
		exporting = true;
		try {
			const res = await fetch(
				`/api/ads/google/${data.client.id}/live/${data.campaign.id}/export${window.location.search}`,
				{ method: 'POST' }
			);
			if (res.ok) {
				const blob = await res.blob();
				const url  = window.URL.createObjectURL(blob);
				const a    = document.createElement('a');
				a.href = url; a.download = `campaign_${data.campaign.id}_report.md`;
				document.body.appendChild(a); a.click();
				window.URL.revokeObjectURL(url); document.body.removeChild(a);
			} else { alert('Failed to generate report'); }
		} catch { alert('Error exporting report'); }
		exporting = false;
	}

	function setPeriod(days: number) {
		const end   = new Date();
		const start = new Date();
		start.setDate(end.getDate() - days);
		const fmt = (d: Date) => d.toISOString().split('T')[0];
		goto(`?startDate=${fmt(start)}&endDate=${fmt(end)}`, { keepFocus: true });
	}

	function clearPeriod() { goto('?', { keepFocus: true }); }

	function brl(v: number) { return 'R$' + v.toFixed(2); }

	function pacing_color(pct: number): string {
		if (pct > 0.9)  return 'bg-emerald-500';
		if (pct > 0.5)  return 'bg-amber-400';
		return 'bg-red-400';
	}
</script>

<!-- ── Toolbar ──────────────────────────────────────────────────────────── -->
<div class="px-4 sm:px-6 lg:px-8 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
	<div class="flex items-center gap-4">
		<a href="/{data.tenant}/ads/google" class="text-slate-500 hover:text-slate-900 dark:hover:text-slate-300">
			<ArrowLeft class="w-5 h-5" />
		</a>
		<h2 class="font-semibold text-lg flex items-center gap-2">
			<ActivityIcon class="w-4 h-4 text-emerald-500" />
			Live Campaign Details
		</h2>
	</div>
	<button
		onclick={exportReport} disabled={exporting}
		class="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 rounded-md font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
	>
		{#if exporting}
			<Loader2 class="w-4 h-4 animate-spin" /> Generating...
		{:else}
			<Download class="w-4 h-4" /> Export Markdown for AI
		{/if}
	</button>
</div>

<div class="max-w-5xl mx-auto p-6 space-y-6 {isLoadingPeriod ? 'opacity-50 pointer-events-none' : ''} relative">

	{#if isLoadingPeriod}
		<div class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
			<div class="bg-white dark:bg-slate-800 px-6 py-3 rounded-full shadow-lg flex items-center gap-3 border border-slate-200 dark:border-slate-700">
				<Loader2 class="w-5 h-5 animate-spin text-indigo-500" />
				<span class="font-medium text-slate-700 dark:text-slate-200">Updating report data...</span>
			</div>
		</div>
	{/if}

	<!-- ── Alert banner ─────────────────────────────────────────────────── -->
	{#if data.openAlerts.length > 0}
		<div class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4 flex flex-col gap-2">
			{#each data.openAlerts as alert}
				<div class="flex items-start gap-3">
					{#if alert.level === 'CRITICAL'}
						<AlertOctagon class="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
					{:else}
						<AlertTriangle class="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
					{/if}
					<div>
						<span class="text-xs font-bold text-red-700 dark:text-red-300 uppercase tracking-wide mr-2">{alert.level}</span>
						<span class="text-sm text-red-800 dark:text-red-200">{alert.message}</span>
						{#if alert.action_suggested}
							<p class="text-xs text-red-600 dark:text-red-400 mt-0.5">→ {alert.action_suggested}</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- ── Header card ──────────────────────────────────────────────────── -->
	<div class="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative overflow-hidden">
		<div class="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
		<div class="relative z-10">
			<div class="flex items-center gap-2 mb-2">
				<span class="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">ID: {data.campaign.id}</span>
				{#if data.campaign.status === 'ENABLED'}
					<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
						<Play class="w-3 h-3" /> Active
					</span>
				{:else}
					<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
						<Pause class="w-3 h-3" /> Paused
					</span>
				{/if}
			</div>
			<h1 class="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{data.campaign.name}</h1>
			<p class="text-sm text-slate-500 mt-2 flex items-center gap-2">
				<Target class="w-4 h-4" /> Bidding: <span class="font-medium text-slate-700 dark:text-slate-300">{data.campaign.strategy}</span>
			</p>
		</div>
		<div class="flex items-center bg-slate-100 dark:bg-slate-800/50 p-1 rounded-lg border border-slate-200 dark:border-slate-700/50 relative z-10">
			<button onclick={() => clearPeriod()} disabled={isLoadingPeriod} class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm text-slate-600 dark:text-slate-300 disabled:opacity-50">All Time</button>
			<button onclick={() => setPeriod(7)} disabled={isLoadingPeriod} class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm text-slate-600 dark:text-slate-300 disabled:opacity-50">7 Days</button>
			<button onclick={() => setPeriod(30)} disabled={isLoadingPeriod} class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm text-slate-600 dark:text-slate-300 disabled:opacity-50">30 Days</button>
		</div>
	</div>

	<!-- ── 4 metric cards (with WoW delta) ──────────────────────────────── -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">

		<!-- Impressions -->
		<div class="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
			<div class="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
				<Activity class="w-16 h-16 text-indigo-500" />
			</div>
			<div class="flex items-center gap-2 text-slate-500 mb-2 text-sm font-medium relative z-10">
				<div class="w-8 h-8 rounded-md bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-500">
					<Activity class="w-4 h-4" />
				</div>
				Impressions
			</div>
			<div class="text-3xl font-bold text-slate-900 dark:text-white relative z-10">{data.campaign.metrics.impressions}</div>
			<div class="text-xs font-semibold text-slate-400 mt-1 relative z-10 tracking-wide uppercase">Share: {data.campaign.metrics.searchImpressionShare}</div>
			{#if deltas.impressions.dir !== 'flat'}
				<div class="flex items-center gap-1 mt-2 relative z-10">
					{#if deltas.impressions.dir === 'up'}
						<TrendingUp class="w-3 h-3 text-emerald-500" />
						<span class="text-xs font-bold text-emerald-600 dark:text-emerald-400">{deltas.impressions.pct} vs prev. wk.</span>
					{:else}
						<TrendingDown class="w-3 h-3 text-red-400" />
						<span class="text-xs font-bold text-red-500 dark:text-red-400">{deltas.impressions.pct} vs prev. wk.</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Clicks -->
		<div class="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-blue-200 dark:hover:border-blue-800 transition-colors">
			<div class="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
				<MousePointerClick class="w-16 h-16 text-blue-500" />
			</div>
			<div class="flex items-center gap-2 text-slate-500 mb-2 text-sm font-medium relative z-10">
				<div class="w-8 h-8 rounded-md bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-500">
					<MousePointerClick class="w-4 h-4" />
				</div>
				Clicks
			</div>
			<div class="text-3xl font-bold text-slate-900 dark:text-white relative z-10">{data.campaign.metrics.clicks}</div>
			<div class="text-xs font-semibold text-slate-400 mt-1 relative z-10 tracking-wide uppercase">CTR: {data.campaign.metrics.ctr}</div>
			{#if deltas.clicks.dir !== 'flat'}
				<div class="flex items-center gap-1 mt-2 relative z-10">
					{#if deltas.clicks.dir === 'up'}
						<TrendingUp class="w-3 h-3 text-emerald-500" />
						<span class="text-xs font-bold text-emerald-600 dark:text-emerald-400">{deltas.clicks.pct} vs prev. wk.</span>
					{:else}
						<TrendingDown class="w-3 h-3 text-red-400" />
						<span class="text-xs font-bold text-red-500 dark:text-red-400">{deltas.clicks.pct} vs prev. wk.</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Cost -->
		<div class="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-emerald-200 dark:hover:border-emerald-800 transition-colors">
			<div class="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
				<DollarSign class="w-16 h-16 text-emerald-500" />
			</div>
			<div class="flex items-center gap-2 text-slate-500 mb-2 text-sm font-medium relative z-10">
				<div class="w-8 h-8 rounded-md bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-500">
					<DollarSign class="w-4 h-4" />
				</div>
				Total Cost
			</div>
			<div class="text-3xl font-bold text-slate-900 dark:text-white relative z-10">${data.campaign.metrics.cost}</div>
			{#if deltas.cost.dir !== 'flat'}
				<div class="flex items-center gap-1 mt-2 relative z-10">
					{#if deltas.cost.dir === 'up'}
						<TrendingUp class="w-3 h-3 text-emerald-500" />
						<span class="text-xs font-bold text-emerald-600 dark:text-emerald-400">{deltas.cost.pct} vs prev. wk.</span>
					{:else}
						<TrendingDown class="w-3 h-3 text-red-400" />
						<span class="text-xs font-bold text-red-500 dark:text-red-400">{deltas.cost.pct} vs prev. wk.</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Conversions -->
		<div class="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-amber-200 dark:hover:border-amber-800 transition-colors">
			<div class="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
				<Target class="w-16 h-16 text-amber-500" />
			</div>
			<div class="flex items-center gap-2 text-slate-500 mb-2 text-sm font-medium relative z-10">
				<div class="w-8 h-8 rounded-md bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-amber-500">
					<Target class="w-4 h-4" />
				</div>
				Conversions
			</div>
			<div class="text-3xl font-bold text-slate-900 dark:text-white relative z-10">{data.campaign.metrics.conversions}</div>
			<div class="text-xs font-semibold text-slate-400 mt-1 relative z-10 tracking-wide uppercase">CPA: ${data.campaign.metrics.cpa}</div>
			{#if deltas.conversions.dir !== 'flat'}
				<div class="flex items-center gap-1 mt-2 relative z-10">
					{#if deltas.conversions.dir === 'up'}
						<TrendingUp class="w-3 h-3 text-emerald-500" />
						<span class="text-xs font-bold text-emerald-600 dark:text-emerald-400">{deltas.conversions.pct} vs prev. wk.</span>
					{:else}
						<TrendingDown class="w-3 h-3 text-red-400" />
						<span class="text-xs font-bold text-red-500 dark:text-red-400">{deltas.conversions.pct} vs prev. wk.</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- ── Budget pacing + Monthly summary ──────────────────────────────── -->
	{#if data.budgetPacing || data.monthly}
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

			<!-- Budget pacing -->
			{#if data.budgetPacing}
				{@const p = data.budgetPacing}
				<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
					<div class="flex items-center gap-2 text-slate-500 mb-3 text-sm font-medium">
						<div class="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
							<Gauge class="w-4 h-4" />
						</div>
						Budget Pacing — <span class="font-mono text-xs">{p.date}</span>
					</div>
					<div class="flex items-end justify-between mb-2">
						<span class="text-2xl font-bold text-slate-900 dark:text-white">{brl(p.cost)}</span>
						<span class="text-sm text-slate-500">of {brl(p.budget)}/day</span>
					</div>
					<div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
						<div
							class="h-2 rounded-full transition-all {pacing_color(p.pct)}"
							style="width: {Math.min(p.pct * 100, 100).toFixed(0)}%"
						></div>
					</div>
					<p class="text-xs text-slate-400 mt-1.5 text-right">{(p.pct * 100).toFixed(0)}% used</p>
				</div>
			{/if}

			<!-- Monthly summary -->
			{#if data.monthly}
				{@const m = data.monthly}
				<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
					<div class="flex items-center gap-2 text-slate-500 mb-3 text-sm font-medium">
						<div class="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
							<CalendarDays class="w-4 h-4" />
						</div>
						Current Month — MTD
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<p class="text-xs text-slate-400 uppercase tracking-wide font-semibold">Spend</p>
							<p class="text-xl font-bold text-slate-900 dark:text-white">{brl(m.totalCost)}</p>
						</div>
						<div>
							<p class="text-xs text-slate-400 uppercase tracking-wide font-semibold">Conversions</p>
							<p class="text-xl font-bold text-slate-900 dark:text-white">{m.totalConversions}</p>
						</div>
						<div>
							<p class="text-xs text-slate-400 uppercase tracking-wide font-semibold">Active Days</p>
							<p class="text-xl font-bold text-slate-900 dark:text-white">{m.daysActive}</p>
						</div>
						<div>
							<p class="text-xs text-slate-400 uppercase tracking-wide font-semibold">Avg CPA</p>
							<p class="text-xl font-bold text-slate-900 dark:text-white">{m.avgCpa > 0 ? brl(m.avgCpa) : '—'}</p>
						</div>
					</div>
				</div>
			{/if}

		</div>
	{/if}

	<!-- ── API chart ────────────────────────────────────────────────────── -->
	{#if data.campaign.history && data.campaign.history.length > 0}
		<div class="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
			<h3 class="flex items-center gap-2 text-lg text-slate-900 dark:text-white font-bold mb-6">
				<Activity class="w-5 h-5 text-indigo-500" /> Performance Timeline
				<span class="ml-auto text-xs font-normal text-slate-400">source: Google Ads API</span>
			</h3>
			<div class="w-full h-[280px]">
				<canvas bind:this={chartCanvas}></canvas>
			</div>
		</div>
	{/if}

	<!-- ── 30-day historical chart (SQLite) ─────────────────────────────── -->
	{#if data.dbHistory.length > 0}
		<div class="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
			<h3 class="flex items-center gap-2 text-lg text-slate-900 dark:text-white font-bold mb-1">
				<BarChart2 class="w-5 h-5 text-indigo-500" /> Daily Cost + CPA — 30 days
				<span class="ml-auto text-xs font-normal text-slate-400">source: local monitoring</span>
			</h3>
			<p class="text-xs text-slate-400 mb-5 ml-7">CPA plotted only on days with conversions</p>
			<div class="w-full h-[280px]">
				<canvas bind:this={historyCanvas}></canvas>
			</div>
		</div>
	{/if}

	<!-- ── Ad groups ────────────────────────────────────────────────────── -->
	<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
		<div class="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
			<h3 class="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
				<BarChart2 class="w-5 h-5 text-indigo-500" /> Ad Groups Breakdown
			</h3>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px] font-bold">
					<tr>
						<th class="px-6 py-4">Ad Group</th>
						<th class="px-6 py-4">Status</th>
						<th class="px-6 py-4 text-right">Impressions</th>
						<th class="px-6 py-4 text-right">Clicks</th>
						<th class="px-6 py-4 text-right">Cost</th>
						<th class="px-6 py-4 text-right">Conv.</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-200 dark:divide-slate-800">
					{#each data.campaign.adGroups as group}
						<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
							<td class="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">{group.name}</td>
							<td class="px-6 py-4">
								<span class="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded uppercase {group.status === 'ENABLED' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}">
									{group.status}
								</span>
							</td>
							<td class="px-6 py-4 text-right font-mono text-slate-600 dark:text-slate-400">{group.metrics.impressions}</td>
							<td class="px-6 py-4 text-right font-mono text-slate-600 dark:text-slate-400">{group.metrics.clicks}</td>
							<td class="px-6 py-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-medium">${group.metrics.cost}</td>
							<td class="px-6 py-4 text-right font-mono text-amber-600 dark:text-amber-400 font-bold">{group.metrics.conversions}</td>
						</tr>
					{/each}
					{#if data.campaign.adGroups.length === 0}
						<tr>
							<td colspan="6" class="px-6 py-8 text-center text-slate-500">No ad groups found.</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
