<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { ArrowLeft, Save, Search, Target, DollarSign, LayoutList } from 'lucide-svelte';

	let { data } = $props<{ data: PageData }>();

	let campaign = $state(untrack(() => data.campaign));
	$effect(() => { campaign = data.campaign; });
	let saving = $state(false);
	let saveError = $state('');

	async function saveCampaign() {
		saving = true;
		saveError = '';
		const res = await fetch(`/api/ads/google/${data.tenant}/${data.campaign.filename}/status`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status: campaign.status })
		});
		saving = false;
		if (res.ok) {
			window.location.href = `/${data.tenant}/ads/google`;
		} else {
			const err = await res.json();
			saveError = err.error || 'Failed to save';
		}
	}
</script>

<div class="h-14 flex items-center px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm z-10 sticky top-0">
	<div class="flex items-center gap-4">
		<a href="/{data.tenant}/ads/google" class="text-slate-500 hover:text-slate-900 dark:hover:text-slate-300">
			<ArrowLeft class="w-5 h-5" />
		</a>
		<h2 class="font-semibold text-lg flex items-center gap-2">
			<Search class="w-4 h-4 text-slate-400" />
			Edit Campaign
		</h2>
	</div>
	<div class="ml-auto flex items-center gap-3">
		{#if saveError}
			<span class="text-sm text-red-600 dark:text-red-400">{saveError}</span>
		{/if}
		<button
			onclick={saveCampaign}
			disabled={saving}
			class="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-md font-medium text-sm transition-colors disabled:opacity-50"
		>
			<Save class="w-4 h-4" /> {saving ? 'Saving...' : 'Save Status'}
		</button>
	</div>
</div>

<div class="max-w-5xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
	<!-- Editor -->
	<div class="lg:col-span-2 space-y-6">
		<div class="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
			<h3 class="text-lg font-bold text-slate-900 dark:text-white mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">Campaign Details</h3>
			
			<div class="space-y-4">
				<div>
					<label for="campaign-objective" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Objective</label>
					<input
						id="campaign-objective"
						type="text"
						bind:value={campaign.objective}
						class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</div>
				
				<div>
					<label for="campaign-budget" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Budget Suggestion</label>
					<input
						id="campaign-budget"
						type="text"
						bind:value={campaign.budget_suggestion}
						class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</div>
			</div>
		</div>

		<div class="space-y-4">
			<h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
				<LayoutList class="w-5 h-5 text-indigo-500" /> Ad Groups
			</h3>
			
			{#each campaign.ad_groups as group, i}
				<div class="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
					<div class="mb-4">
						<label for="ad-group-name-{i}" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ad Group Name</label>
						<input
							id="ad-group-name-{i}"
							type="text"
							bind:value={campaign.ad_groups[i].name}
							class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
						/>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
						<div>
							<label for="ad-group-keywords-{i}" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Keywords</label>
							<textarea
								id="ad-group-keywords-{i}"
								value={group.keywords.join('\n')}
								rows="4"
								class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono text-slate-600 dark:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
							></textarea>
						</div>
						<div>
							<label for="ad-group-neg-{i}" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Negative Keywords</label>
							<textarea
								id="ad-group-neg-{i}"
								value={group.negative_keywords.join('\n')}
								rows="4"
								class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono text-slate-600 dark:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
							></textarea>
						</div>
					</div>

					<div class="border-t border-slate-100 dark:border-slate-800 pt-4">
						<h4 class="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">Responsive Search Ad</h4>
						
						<div class="space-y-3 mb-4">
							<span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Headlines (Max 30 chars)</span>
							{#each group.responsive_search_ad.headlines as headline}
								<div class="flex items-center gap-2">
									<input 
										type="text" 
										value={headline}
										class="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 {headline.length > 30 ? 'border-red-500 focus:ring-red-500' : ''}"
									/>
									<span class="text-xs font-mono {headline.length > 30 ? 'text-red-500 font-bold' : 'text-slate-400'}">{headline.length}/30</span>
								</div>
							{/each}
						</div>

						<div class="space-y-3">
							<span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Descriptions (Max 90 chars)</span>
							{#each group.responsive_search_ad.descriptions as description}
								<div class="flex items-center gap-2">
									<input 
										type="text" 
										value={description}
										class="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 {description.length > 90 ? 'border-red-500 focus:ring-red-500' : ''}"
									/>
									<span class="text-xs font-mono {description.length > 90 ? 'text-red-500 font-bold' : 'text-slate-400'}">{description.length}/90</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Sidebar Meta -->
	<div class="space-y-6">
		<div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
			<h3 class="text-sm font-bold text-slate-900 dark:text-white mb-3">Campaign Info</h3>
			<div class="space-y-3 text-sm text-slate-600 dark:text-slate-400">
				<div class="flex justify-between items-center">
					<span>ID</span>
					<span class="font-mono text-xs">{campaign.id}</span>
				</div>
				<div class="flex justify-between items-center">
					<span>Status</span>
					<select bind:value={campaign.status} class="text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 {campaign.status === 'approved' ? 'text-emerald-600' : 'text-amber-600'}">
						<option value="draft" class="text-amber-600 font-medium">draft</option>
						<option value="approved" class="text-emerald-600 font-medium">approved</option>
					</select>
				</div>
				<div class="flex justify-between items-center">
					<span>Platform</span>
					<span class="text-xs font-bold text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded">{campaign.platform}</span>
				</div>
			</div>
		</div>

		{#if campaign.workflow}
			<div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
				<h3 class="text-sm font-bold text-slate-900 dark:text-white mb-3">AI Reasoning</h3>
				<p class="text-sm text-slate-700 dark:text-slate-300">
					{campaign.workflow.reasoning}
				</p>
			</div>
		{/if}
	</div>
</div>