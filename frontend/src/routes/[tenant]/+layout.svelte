<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		Share2,
		Target,
		Settings,
		Menu,
		X,
		FileText,
		Bell,
		CalendarClock,
		ChevronDown,
		Plus,
		Check,
		Cog,
	} from 'lucide-svelte';
	import { DropdownMenu, Tooltip } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children } = $props<{ data: LayoutData; children: Snippet }>();

	let currentPath = $derived($page.url.pathname);
	let isMobileMenuOpen = $state(false);

	const navMain = $derived([
		{
			href: `/${data.tenant}/social`,
			label: 'Social',
			icon: Share2,
			active: currentPath.includes('/social'),
		},
		{
			href: `/${data.tenant}/ads/google`,
			label: 'Google Ads',
			icon: Target,
			active: currentPath.includes('/ads/google'),
		},
	]);

	const navIcons = $derived([
		{
			href: `/${data.tenant}/reports`,
			label: 'Reports',
			icon: FileText,
			active: currentPath.includes('/reports'),
		},
		{
			href: `/${data.tenant}/alerts`,
			label: 'Alerts',
			icon: Bell,
			active: currentPath.includes('/alerts'),
		},
		{
			href: `/${data.tenant}/schedule`,
			label: 'Schedule',
			icon: CalendarClock,
			active: currentPath.includes('/schedule'),
		},
	]);

	const initials = $derived(
		data.client.brand.name
			.split(' ')
			.slice(0, 2)
			.map((w: string) => w[0])
			.join('')
			.toUpperCase()
	);
</script>

<div class="flex min-h-screen w-full flex-col bg-slate-50 dark:bg-slate-950">
	<!-- Top Navigation -->
	<header
		class="sticky top-0 z-50 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 print:hidden"
	>
		<div class="px-4 lg:px-6">
			<div class="flex h-16 items-center justify-between">

				<!-- Tenant switcher dropdown -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none"
					>
						<div
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-600 shadow-sm dark:bg-indigo-900/50 dark:text-indigo-400"
						>
							{initials}
						</div>
						<span class="font-bold text-slate-900 dark:text-white text-base leading-tight">
							{data.client.brand.name}
						</span>
						<ChevronDown class="h-3.5 w-3.5 text-slate-400" />
					</DropdownMenu.Trigger>

					<DropdownMenu.Portal>
						<DropdownMenu.Content
							class="z-50 min-w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
							align="start"
							sideOffset={8}
						>
							<p class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
								Clients
							</p>
							{#each data.clients as client}
								<DropdownMenu.Item
									onclick={() => goto(`/${client.id}/social`)}
									class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
								>
									<div
										class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400"
									>
										{client.brand.name.substring(0, 2).toUpperCase()}
									</div>
									<span class="flex-1 truncate">{client.brand.name}</span>
									{#if client.id === data.tenant}
										<Check class="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
									{/if}
								</DropdownMenu.Item>
							{/each}
							<DropdownMenu.Separator
								class="my-1.5 h-px bg-slate-100 dark:bg-slate-800"
							/>
							<DropdownMenu.Item
								onclick={() => goto('/tenants/new')}
								class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 outline-none transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
							>
								<Plus class="h-4 w-4" /> New Client
							</DropdownMenu.Item>
							<DropdownMenu.Separator class="my-1.5 h-px bg-slate-100 dark:bg-slate-800" />
							<DropdownMenu.Item
								onclick={() => goto('/settings')}
								class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 outline-none transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
							>
								<Cog class="h-4 w-4" /> App Settings
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>

				<!-- Desktop nav -->
				<nav class="hidden items-center gap-1 md:flex">
					<!-- Text items: Social + Google Ads — equal width -->
					{#each navMain as item}
						{@const Icon = item.icon}
						<a
							href={item.href}
							class="flex w-28 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors {item.active
								? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
								: 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}"
						>
							<Icon class="h-4 w-4" />
							{item.label}
						</a>
					{/each}

					<div class="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700"></div>

					<!-- Icon-only items with tooltip -->
					<Tooltip.Provider delayDuration={200}>
						{#each navIcons as item}
							{@const Icon = item.icon}
							<Tooltip.Root>
								<Tooltip.Trigger
									onclick={() => goto(item.href)}
									class="flex h-9 w-9 items-center justify-center rounded-md transition-colors {item.active
										? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
										: 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}"
								>
									<Icon class="h-4 w-4" />
								</Tooltip.Trigger>
								<Tooltip.Content
									side="bottom"
									sideOffset={6}
									class="z-[100] rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-md dark:bg-slate-700"
								>
									{item.label}
								</Tooltip.Content>
							</Tooltip.Root>
						{/each}
					</Tooltip.Provider>

					<!-- Settings — icon only, no tooltip, no divider -->
					<a
						href="/{data.tenant}/settings"
						class="flex h-9 w-9 items-center justify-center rounded-md transition-colors {currentPath.includes('/settings')
							? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
							: 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}"
					>
						<Settings class="h-4 w-4" />
					</a>
				</nav>

				<!-- Mobile menu button -->
				<div class="flex items-center md:hidden">
					<button
						onclick={() => (isMobileMenuOpen = !isMobileMenuOpen)}
						class="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-500 focus:outline-none dark:hover:bg-slate-800"
					>
						{#if isMobileMenuOpen}
							<X class="h-6 w-6" />
						{:else}
							<Menu class="h-6 w-6" />
						{/if}
					</button>
				</div>
			</div>
		</div>

		<!-- Mobile menu -->
		{#if isMobileMenuOpen}
			<div
				class="border-t border-slate-200 bg-white px-2 pb-3 pt-2 dark:border-slate-800 dark:bg-slate-900 md:hidden"
			>
				{#each [...navMain, ...navIcons] as item}
					{@const Icon = item.icon}
					<a
						href={item.href}
						onclick={() => (isMobileMenuOpen = false)}
						class="flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium {item.active
							? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
							: 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}"
					>
						<Icon class="h-5 w-5" />
						{item.label}
					</a>
				{/each}
				<a
					href="/{data.tenant}/settings"
					onclick={() => (isMobileMenuOpen = false)}
					class="flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium {currentPath.includes('/settings')
						? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
						: 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}"
				>
					<Settings class="h-5 w-5" />
					Settings
				</a>
			</div>
		{/if}
	</header>

	<!-- Content -->
	<main class="flex flex-1 flex-col min-w-0 overflow-y-auto print:h-auto print:flex-none print:overflow-visible">
		{@render children()}
	</main>
</div>
