<script lang="ts">
	import { page } from '$app/stores';
	import { Share2, Search, Monitor, Settings, Menu, X, FileText, Bell, CalendarClock } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children } = $props<{ data: LayoutData; children: Snippet }>();

	let currentPath = $derived($page.url.pathname);
	let isMobileMenuOpen = $state(false);
</script>

<div class="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col">
	<!-- Top Navigation -->
	<header class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 print:hidden">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between h-16">
				<!-- Brand/Logo Area -->
				<div class="flex items-center gap-4">
					<a href="/" class="text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors" title="Back to All Clients">
						&larr;
					</a>
					<div class="flex items-center gap-3">
						<div class="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-sm uppercase shadow-sm">
							{data.client.brand.name.substring(0, 2)}
						</div>
						<div>
							<h1 class="font-bold text-slate-900 dark:text-white text-base leading-tight">{data.client.brand.name}</h1>
						</div>
					</div>
				</div>

				<!-- Desktop Menu -->
				<nav class="hidden md:flex items-center gap-1">
					<a 
						href="/{data.tenant}/social" 
						class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors {currentPath.includes('/social') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
					>
						<Share2 class="w-4 h-4" /> Social
					</a>
					<a 
						href="/{data.tenant}/ads/google" 
						class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors {currentPath.includes('/ads/google') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
					>
						<Search class="w-4 h-4" /> Google Ads
					</a>
					<a 
						href="/{data.tenant}/ads/meta" 
						class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors {currentPath.includes('/ads/meta') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
					>
						<Monitor class="w-4 h-4" /> Meta Ads
					</a>
					<a
						href="/{data.tenant}/reports"
						class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors {currentPath.includes('/reports') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
					>
						<FileText class="w-4 h-4" /> Reports
					</a>
					<a
						href="/{data.tenant}/alerts"
						class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors {currentPath.includes('/alerts') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
					>
						<Bell class="w-4 h-4" /> Alerts
					</a>
					<a
						href="/{data.tenant}/schedule"
						class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors {currentPath.includes('/schedule') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
					>
						<CalendarClock class="w-4 h-4" /> Schedule
					</a>
					<div class="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-2"></div>
					<a
						href="/{data.tenant}/settings"
						class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors {currentPath.includes('/settings') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
					>
						<Settings class="w-4 h-4" /> Settings
					</a>
				</nav>

				<!-- Mobile Menu Button -->
				<div class="md:hidden flex items-center">
					<button 
						onclick={() => isMobileMenuOpen = !isMobileMenuOpen}
						class="p-2 rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none"
					>
						{#if isMobileMenuOpen}
							<X class="w-6 h-6" />
						{:else}
							<Menu class="w-6 h-6" />
						{/if}
					</button>
				</div>
			</div>
		</div>

		<!-- Mobile Menu Panel -->
		{#if isMobileMenuOpen}
			<div class="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 pt-2 pb-3 space-y-1">
				<a 
					href="/{data.tenant}/social" 
					class="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium {currentPath.includes('/social') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}"
				>
					<Share2 class="w-5 h-5" /> Social Media
				</a>
				<a 
					href="/{data.tenant}/ads/google" 
					class="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium {currentPath.includes('/ads/google') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}"
				>
					<Search class="w-5 h-5" /> Google Ads
				</a>
				<a 
					href="/{data.tenant}/ads/meta" 
					class="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium {currentPath.includes('/ads/meta') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}"
				>
					<Monitor class="w-5 h-5" /> Meta Ads
				</a>
				<a
					href="/{data.tenant}/reports"
					class="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium {currentPath.includes('/reports') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}"
				>
					<FileText class="w-5 h-5" /> Reports
				</a>
				<a
					href="/{data.tenant}/alerts"
					class="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium {currentPath.includes('/alerts') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}"
				>
					<Bell class="w-5 h-5" /> Alerts
				</a>
				<a
					href="/{data.tenant}/schedule"
					class="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium {currentPath.includes('/schedule') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}"
				>
					<CalendarClock class="w-5 h-5" /> Schedule
				</a>
				<a
					href="/{data.tenant}/settings"
					class="flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium {currentPath.includes('/settings') ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}"
				>
					<Settings class="w-5 h-5" /> Settings
				</a>
			</div>
		{/if}
	</header>

	<!-- Main Content Area -->
	<main class="flex-1 flex flex-col min-w-0 overflow-y-auto print:flex-none print:overflow-visible print:h-auto">
		{@render children()}
	</main>
</div>