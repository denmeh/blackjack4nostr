<script lang="ts">
	import { onMount } from 'svelte';
	import { getNostrSdk, isNostrReady } from '$lib/nostr';
	import { saveIdentity, saveNwc, hasSession } from '$lib/session';
	import { goto } from '$app/navigation';

	type IdentityMethod = 'generate' | 'nsec' | 'mnemonic';

	let step = $state(1);
	let method = $state<IdentityMethod>('generate');
	let nsecInput = $state('');
	let mnemonicInput = $state('');
	let nwcUrl = $state('');
	let error = $state('');
	let loading = $state(false);

	// If already set up, go home
	$effect(() => {
		if (typeof window !== 'undefined' && hasSession()) {
			goto('/');
		}
	});

	async function completeIdentity() {
		error = '';
		loading = true;
		try {
			const { Keys } = await getNostrSdk();
			let nsec: string;
			let npub: string;

			if (method === 'generate') {
				const keys = Keys.generate();
				nsec = keys.secretKey.toBech32();
				npub = keys.publicKey.toBech32();
			} else if (method === 'nsec') {
				const raw = nsecInput.trim();
				if (!raw) {
					error = 'Enter an nsec key';
					return;
				}
				const keys = Keys.parse(raw);
				nsec = keys.secretKey.toBech32();
				npub = keys.publicKey.toBech32();
			} else {
				const raw = mnemonicInput.trim();
				if (!raw) {
					error = 'Enter your BIP39 mnemonic phrase';
					return;
				}
				const keys = Keys.fromMnemonic(raw);
				nsec = keys.secretKey.toBech32();
				npub = keys.publicKey.toBech32();
			}

			saveIdentity(nsec, npub);
			step = 2;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	function completeNwc() {
		error = '';
		const url = nwcUrl.trim();
		if (!url) {
			error = 'Enter your NWC connection URL';
			return;
		}
		if (!url.startsWith('nostr+walletconnect://') && !url.startsWith('nostr+wss://')) {
			error = 'NWC URL should start with nostr+walletconnect:// or nostr+wss://';
			return;
		}
		try {
			saveNwc(url);
			goto('/');
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<svelte:head>
	<title>Setup — Blackjack4Nostr</title>
</svelte:head>

<main class="wizard">
	<div class="wizard-header">
		<h1>Setup</h1>
		<p class="sub">Connect your Nostr identity and wallet.</p>
	</div>

	{#if step === 1}
		<section class="card">
			<h2 class="card-title">1. Nostr identity</h2>
			<div class="tabs">
				<button
					class="tab"
					class:active={method === 'generate'}
					onclick={() => (method = 'generate')}
				>
					Generate new
				</button>
				<button class="tab" class:active={method === 'nsec'} onclick={() => (method = 'nsec')}>
					Import nsec
				</button>
				<button
					class="tab"
					class:active={method === 'mnemonic'}
					onclick={() => (method = 'mnemonic')}
				>
					Import mnemonic
				</button>
			</div>

			{#if method === 'generate'}
				<p class="hint">A new key pair will be generated. Back up your nsec somewhere safe.</p>
			{:else if method === 'nsec'}
				<label for="nsec">Secret key (nsec…)</label>
				<input
					id="nsec"
					type="password"
					placeholder="nsec1…"
					bind:value={nsecInput}
					autocomplete="off"
				/>
			{:else}
				<label for="mnemonic">BIP39 mnemonic (12 or 24 words)</label>
				<textarea
					id="mnemonic"
					placeholder="word1 word2 …"
					bind:value={mnemonicInput}
					rows="3"
					autocomplete="off"
				></textarea>
			{/if}

			{#if error}
				<p class="error">{error}</p>
			{/if}
			<button
				class="btn btn-primary"
				disabled={loading || !$isNostrReady}
				onclick={completeIdentity}
			>
				{#if !$isNostrReady}
					Loading…
				{:else if loading}
					Please wait…
				{:else}
					Continue →
				{/if}
			</button>
		</section>
	{:else}
		<section class="card">
			<h2 class="card-title">2. Nostr Wallet Connect (NWC)</h2>
			<p class="hint">
				Paste the NWC URL from your Lightning wallet (e.g. Mutiny, Alby, Zeus). It usually
				starts with <code>nostr+walletconnect://</code>.
			</p>
			<label for="nwc">NWC connection URL</label>
			<input
				id="nwc"
				type="password"
				placeholder="nostr+walletconnect://…"
				bind:value={nwcUrl}
				autocomplete="off"
			/>
			{#if error}
				<p class="error">{error}</p>
			{/if}
			<div class="row">
				<button class="btn btn-secondary" onclick={() => (step = 1)}>← Back</button>
				<button class="btn btn-primary" onclick={completeNwc}>Finish</button>
			</div>
		</section>
	{/if}
</main>

<style>
	.wizard {
		min-height: 100vh;
		background: #0f172a;
		font-family: var(--font-sans, system-ui, sans-serif);
		color: #f1f5f9;
		padding: 1rem;
	}
	.wizard-header {
		max-width: 28rem;
		margin: 0 auto 1.5rem;
	}
	.wizard-header h1 {
		font-size: 1.5rem;
		font-weight: 600;
		color: #fff;
		margin: 0 0 0.25rem 0;
	}
	.sub {
		color: #94a3b8;
		font-size: 0.9rem;
		margin: 0;
	}
	.card {
		max-width: 28rem;
		margin: 0 auto;
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 8px;
		padding: 1.5rem;
	}
	.card-title {
		font-size: 1rem;
		font-weight: 600;
		color: #e2e8f0;
		margin: 0 0 1rem 0;
	}
	.tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.tab {
		padding: 0.5rem 0.75rem;
		font-size: 0.9rem;
		border: 1px solid #334155;
		background: #334155;
		color: #cbd5e1;
		border-radius: 6px;
		cursor: pointer;
	}
	.tab:hover {
		background: #475569;
		color: #e2e8f0;
	}
	.tab.active {
		background: #475569;
		border-color: #64748b;
		color: #fff;
	}
	.hint {
		font-size: 0.875rem;
		color: #94a3b8;
		margin-bottom: 1rem;
		line-height: 1.45;
	}
	.hint code {
		font-size: 0.8em;
		background: #334155;
		color: #e2e8f0;
		padding: 0.15em 0.4em;
		border-radius: 4px;
	}
	label {
		display: block;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #94a3b8;
		margin-bottom: 0.35rem;
	}
	input,
	textarea {
		width: 100%;
		padding: 0.6rem 0.75rem;
		font-size: 1rem;
		border: 1px solid #334155;
		border-radius: 6px;
		background: #334155;
		color: #e2e8f0;
		margin-bottom: 1rem;
		box-sizing: border-box;
	}
	input::placeholder,
	textarea::placeholder {
		color: #64748b;
	}
	textarea {
		resize: vertical;
		min-height: 4rem;
	}
	.error {
		color: #f87171;
		font-size: 0.9rem;
		margin-bottom: 0.75rem;
	}
	.btn {
		padding: 0.6rem 1rem;
		font-size: 0.9rem;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 500;
		border: none;
	}
	.btn-primary {
		width: 100%;
		background: #3b82f6;
		color: #fff;
	}
	.btn-primary:hover:not(:disabled) {
		background: #2563eb;
	}
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn-secondary {
		background: #334155;
		border: 1px solid #475569;
		color: #cbd5e1;
	}
	.btn-secondary:hover {
		background: #475569;
		color: #fff;
	}
	.row {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}
	.row .btn-primary {
		flex: 1;
	}
</style>
