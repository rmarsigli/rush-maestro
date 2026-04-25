<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { Dialog, DropdownMenu } from 'bits-ui';
	import {
		ChevronDown,
		CheckCircle2,
		XCircle,
		AlertCircle,
		Link2,
		Pencil,
		Trash2,
		Eye,
		EyeOff,
		Layers,
	} from 'lucide-svelte';
	import ConfirmDialog from '$lib/components/ui/dialog/ConfirmDialog.svelte';
	import MultiSelect from '$lib/components/ui/multiselect/MultiSelect.svelte';
	import type { PageData } from './$types';
	import type { IntegrationWithClients } from '$lib/server/integrations';

	let { data } = $props<{ data: PageData }>();

	let justConnected = $derived($page.url.searchParams.get('connected') === '1');

	// ── Provider options ──────────────────────────────────────────────────────
	const PROVIDERS = [
		{ id: 'google_ads', label: 'Google Ads', icon: '🔍', available: true },
		{ id: 'meta', label: 'Meta (Instagram / Facebook)', icon: '📘', available: false },
		{ id: 'canva', label: 'Canva', icon: '🎨', available: false },
	] as const;

	// ── Add/Edit modal state ──────────────────────────────────────────────────
	let showModal = $state(false);
	let editingId = $state<string | null>(null);
	let selectedProvider = $state<string>('google_ads');

	let formName = $state('');
	let formClientId = $state('');
	let formClientSecret = $state('');
	let formDeveloperToken = $state('');
	let formMccId = $state('');
	let formSelectedClients = $state<string[]>([]);
	let showSecret = $state(false);
	let isSubmitting = $state(false);
	let modalError = $state<string | null>(null);

	// ── Delete state ──────────────────────────────────────────────────────────
	let showDelete = $state(false);
	let deletingId = $state<string | null>(null);
	let isDeleting = $state(false);
	let deleteFormEl = $state<HTMLFormElement | undefined>(undefined);

	function openCreate(providerId: string) {
		editingId = null;
		selectedProvider = providerId;
		formName = '';
		formClientId = '';
		formClientSecret = '';
		formDeveloperToken = '';
		formMccId = '';
		formSelectedClients = [];
		showSecret = false;
		modalError = null;
		showModal = true;
	}

	function openEdit(integration: IntegrationWithClients) {
		editingId = integration.id;
		selectedProvider = integration.provider;
		formName = integration.name;
		formClientId = integration.oauth_client_id ?? '';
		formClientSecret = integration.oauth_client_secret ?? '';
		formDeveloperToken = integration.developer_token ?? '';
		formMccId = integration.login_customer_id ?? '';
		formSelectedClients = [...integration.clients];
		showSecret = false;
		modalError = null;
		showModal = true;
	}

	function confirmDelete(id: string) {
		deletingId = id;
		showDelete = true;
	}

	const providerLabel = $derived(PROVIDERS.find((p) => p.id === selectedProvider)?.label ?? 'Integration');

	const STATUS = {
		connected: { label: 'Connected', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400', Icon: CheckCircle2 },
		pending:   { label: 'Not connected', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400', Icon: XCircle },
		error:     { label: 'Error', cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400', Icon: AlertCircle },
	} as const;
</script>

<div class="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8 w-full">
	<!-- Header -->
	<div class="mb-6 flex items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-bold text-slate-900 dark:text-white">Integrations</h1>
			<p class="text-sm text-slate-500 dark:text-slate-400">OAuth apps and API credentials shared across all clients</p>
		</div>

		<!-- Add Integration dropdown -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none"
			>
				Add Integration <ChevronDown class="h-3.5 w-3.5" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content
					class="z-50 min-w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
					align="end"
					sideOffset={6}
				>
					{#each PROVIDERS as provider}
						{#if provider.available}
							<DropdownMenu.Item
								onclick={() => openCreate(provider.id)}
								class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
							>
								<span class="text-base">{provider.icon}</span>
								{provider.label}
							</DropdownMenu.Item>
						{:else}
							<div class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-400 dark:text-slate-600 cursor-default">
								<span class="text-base opacity-50">{provider.icon}</span>
								<span class="flex-1">{provider.label}</span>
								<span class="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-800">Soon</span>
							</div>
						{/if}
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	</div>

	<!-- Connected banner -->
	{#if justConnected}
		<div class="mb-5 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
			<CheckCircle2 class="h-4 w-4 shrink-0" />
			Google Ads connected successfully. The integration is now active.
		</div>
	{/if}

	<!-- Integration cards -->
	{#if data.integrations.length === 0}
		<div class="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-12 text-center">
			<Layers class="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
			<p class="text-sm font-medium text-slate-500 dark:text-slate-400">No integrations yet</p>
			<p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
				Add a Google Ads integration to start managing campaigns from the UI.
			</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each data.integrations as integration (integration.id)}
				{@const cfg = STATUS[integration.status as keyof typeof STATUS] ?? STATUS.pending}
				{@const Icon = cfg.Icon}
				{@const providerInfo = PROVIDERS.find((p) => p.id === integration.provider)}
				<div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0 flex-1">
							<div class="mb-1 flex items-center gap-2">
								{#if providerInfo}
									<span class="text-base">{providerInfo.icon}</span>
								{/if}
								<span class="text-sm font-semibold text-slate-900 dark:text-white">{integration.name}</span>
								<span class="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide {cfg.cls}">
									<Icon class="h-3 w-3" />{cfg.label}
								</span>
							</div>
							<div class="space-y-0.5 text-xs text-slate-400 dark:text-slate-500">
								{#if integration.login_customer_id}
									<div>MCC: <span class="font-mono">{integration.login_customer_id}</span></div>
								{/if}
								<div>
									Client ID: {integration.oauth_client_id ? '✓' : '✗'} ·
									Secret: {integration.oauth_client_secret ? '✓' : '✗'} ·
									Dev Token: {integration.developer_token ? '✓' : '✗'}
								</div>
								{#if integration.clients.length > 0}
									<div>
										Clients: {integration.clients
											.map((id: string) => data.clientOptions.find((o: { value: string; label: string }) => o.value === id)?.label ?? id)
											.join(' · ')}
									</div>
								{/if}
								{#if integration.status === 'error' && integration.error_message}
									<div class="text-red-500">{integration.error_message}</div>
								{/if}
							</div>
						</div>

						<div class="flex shrink-0 items-center gap-2">
							<button
								onclick={() => openEdit(integration)}
								title="Edit"
								class="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
							>
								<Pencil class="h-3.5 w-3.5" />
							</button>
							{#if integration.provider === 'google_ads'}
								<a
									href="/api/auth/google-ads?integration_id={integration.id}"
									class="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
								>
									<Link2 class="h-3.5 w-3.5" />
									{integration.status === 'connected' ? 'Re-auth' : 'Connect'}
								</a>
							{/if}
							<button
								onclick={() => confirmDelete(integration.id)}
								title="Delete"
								class="rounded-lg border border-slate-200 p-1.5 text-red-400 transition-colors hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-900/10"
							>
								<Trash2 class="h-3.5 w-3.5" />
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- ── Add / Edit modal ───────────────────────────────────────────────────── -->
<Dialog.Root bind:open={showModal}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
		>
			<Dialog.Title class="mb-1 text-base font-bold text-slate-900 dark:text-white">
				{editingId ? `Edit ${providerLabel} Integration` : `Add ${providerLabel} Integration`}
			</Dialog.Title>
			<Dialog.Description class="mb-5 text-sm text-slate-500 dark:text-slate-400">
				{editingId
					? 'Update credentials. Re-authorize after changing Client ID or Secret.'
					: 'Configure your OAuth app credentials. You can connect after saving.'}
			</Dialog.Description>

			<form
				method="POST"
				action={editingId ? '?/update' : '?/create'}
				use:enhance={() => {
					isSubmitting = true;
					modalError = null;
					return async ({ result, update }) => {
						if (result.type === 'success') {
							await update();
							showModal = false;
						} else if (result.type === 'failure') {
							modalError =
								(result.data as { error?: string } | undefined)?.error ?? 'An error occurred';
						}
						isSubmitting = false;
					};
				}}
				class="flex flex-col gap-4"
			>
				{#if editingId}
					<input type="hidden" name="id" value={editingId} />
				{/if}
				<input type="hidden" name="provider" value={selectedProvider} />
				<input type="hidden" name="client_ids" value={JSON.stringify(formSelectedClients)} />

				<!-- Name -->
				<div>
					<label for="int-name" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
						Name <span class="text-red-400">*</span>
					</label>
					<input
						id="int-name"
						name="name"
						type="text"
						bind:value={formName}
						placeholder="e.g. Agency – Standard Account"
						required
						class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
					/>
				</div>

				<!-- Google Ads specific fields -->
				{#if selectedProvider === 'google_ads'}
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label for="int-client-id" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
								OAuth Client ID
							</label>
							<input
								id="int-client-id"
								name="oauth_client_id"
								type="text"
								bind:value={formClientId}
								placeholder="123….apps.googleusercontent.com"
								class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
							/>
						</div>
						<div>
							<label for="int-secret" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
								OAuth Client Secret
							</label>
							<div class="relative">
								<input
									id="int-secret"
									name="oauth_client_secret"
									type={showSecret ? 'text' : 'password'}
									bind:value={formClientSecret}
									placeholder="GOCSPX-…"
									class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-9 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
								/>
								<button
									type="button"
									onclick={() => (showSecret = !showSecret)}
									class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
								>
									{#if showSecret}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
								</button>
							</div>
						</div>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label for="int-dev-token" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
								Developer Token
							</label>
							<input
								id="int-dev-token"
								name="developer_token"
								type="text"
								bind:value={formDeveloperToken}
								placeholder="ABcDef…"
								class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
							/>
						</div>
						<div>
							<label for="int-mcc" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
								MCC Customer ID
							</label>
							<input
								id="int-mcc"
								name="login_customer_id"
								type="text"
								bind:value={formMccId}
								placeholder="123-456-7890"
								class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
							/>
						</div>
					</div>
				{/if}

				<!-- Clients MultiSelect (shared across providers) -->
				<div>
					<p class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
						Clients using this integration
					</p>
					<MultiSelect
						bind:value={formSelectedClients}
						options={data.clientOptions}
						placeholder="Select clients…"
					/>
				</div>

				{#if modalError}
					<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
						{modalError}
					</p>
				{/if}

				<div class="mt-2 flex justify-end gap-3">
					<Dialog.Close
						class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
					>
						Cancel
					</Dialog.Close>
					<button
						type="submit"
						disabled={isSubmitting}
						class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
					>
						{isSubmitting ? 'Saving…' : 'Save'}
					</button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- ── Hidden delete form ────────────────────────────────────────────────── -->
<form
	bind:this={deleteFormEl}
	method="POST"
	action="?/delete"
	use:enhance={() => {
		isDeleting = true;
		return async ({ update }) => {
			await update();
			isDeleting = false;
			showDelete = false;
			deletingId = null;
		};
	}}
>
	<input type="hidden" name="id" value={deletingId ?? ''} />
</form>

<ConfirmDialog
	bind:open={showDelete}
	title="Delete integration?"
	description="This will permanently remove the integration and disconnect all associated clients. This cannot be undone."
	confirmLabel="Delete"
	isLoading={isDeleting}
	onconfirm={() => deleteFormEl?.requestSubmit()}
/>
