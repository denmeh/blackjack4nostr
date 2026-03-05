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
			let keys: InstanceType<typeof Keys>;

			if (method === 'generate') {
				keys = Keys.generate();
			} else if (method === 'nsec') {
				const raw = nsecInput.trim();
				if (!raw) {
					error = 'Enter an nsec key';
					return;
				}
				keys = Keys.parse(raw);
			} else {
				const raw = mnemonicInput.trim();
				if (!raw) {
					error = 'Enter your BIP39 mnemonic phrase';
					return;
				}
				keys = Keys.fromMnemonic(raw);
			}

			const nsec = keys.secretKey.toBech32();
			const npub = keys.publicKey.toBech32();
			saveIdentity(nsec, npub);
			step = 2;
		} catch (e) {
			error = getErrorMessage(e);
		} finally {
			loading = false;
		}
	}

	function getErrorMessage(e: unknown): string {
		return e instanceof Error ? e.message : String(e);
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
			error = getErrorMessage(e);
		}
	}
</script>

<svelte:head>
	<title>Setup — Blackjack4Nostr</title>
</svelte:head>

<main class="wizard">
	<div class="wizard-header">
		<h1><span class="brand-icon">♠</span> Setup</h1>
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
		background: var(--b4n-bg);
		color: var(--b4n-text);
		padding: 1.5rem 1rem;
	}
	.wizard-header {
		max-width: 28rem;
		margin: 0 auto 1.5rem;
		text-align: center;
	}
	.wizard-header h1 {
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--b4n-text-bright);
		margin: 0 0 0.35rem 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
	}
	.brand-icon {
		color: var(--b4n-gold);
	}
	.sub {
		color: var(--b4n-text-muted);
		font-size: 0.95rem;
		margin: 0;
	}
	.card {
		max-width: 28rem;
		margin: 0 auto;
		background: var(--b4n-surface);
		border: 1px solid var(--b4n-border);
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
	}
	.card-title {
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--b4n-text-bright);
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
		border: 1px solid var(--b4n-border);
		background: var(--b4n-surface-elevated);
		color: var(--b4n-text-muted);
		border-radius: 8px;
		cursor: pointer;
		font-weight: 500;
	}
	.tab:hover {
		background: var(--b4n-gold-muted);
		color: var(--b4n-text);
		border-color: var(--b4n-gold-dim);
	}
	.tab.active {
		background: var(--b4n-gold-muted);
		border-color: var(--b4n-gold-dim);
		color: var(--b4n-gold-bright);
	}
	.hint {
		font-size: 0.875rem;
		color: var(--b4n-text-muted);
		margin-bottom: 1rem;
		line-height: 1.5;
	}
	.hint code {
		font-family: var(--font-mono);
		font-size: 0.8em;
		background: var(--b4n-input-bg);
		color: var(--b4n-gold-dim);
		padding: 0.15em 0.4em;
		border-radius: 4px;
		border: 1px solid var(--b4n-input-border);
	}
	label {
		display: block;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--b4n-text-muted);
		margin-bottom: 0.4rem;
	}
	input,
	textarea {
		width: 100%;
		padding: 0.6rem 0.75rem;
		font-size: 1rem;
		border: 1px solid var(--b4n-input-border);
		border-radius: 8px;
		background: var(--b4n-input-bg);
		color: var(--b4n-text);
		margin-bottom: 1rem;
		box-sizing: border-box;
	}
	input:focus,
	textarea:focus {
		outline: none;
		border-color: var(--b4n-gold-muted);
		box-shadow: 0 0 0 2px rgba(212, 168, 83, 0.12);
	}
	input::placeholder,
	textarea::placeholder {
		color: var(--b4n-text-muted);
	}
	textarea {
		resize: vertical;
		min-height: 4rem;
	}
	.error {
		color: var(--b4n-lose);
		font-size: 0.9rem;
		margin-bottom: 0.75rem;
	}
	.btn {
		padding: 0.65rem 1rem;
		font-size: 0.95rem;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		border: none;
	}
	.btn-primary {
		width: 100%;
		background: linear-gradient(180deg, var(--b4n-gold) 0%, var(--b4n-gold-dim) 100%);
		color: #0a0f0d;
		box-shadow: 0 2px 8px rgba(212, 168, 83, 0.3);
	}
	.btn-primary:hover:not(:disabled) {
		background: linear-gradient(180deg, var(--b4n-gold-bright) 0%, var(--b4n-gold) 100%);
		box-shadow: 0 4px 12px rgba(212, 168, 83, 0.35);
	}
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn-secondary {
		background: var(--b4n-surface-elevated);
		border: 1px solid var(--b4n-border);
		color: var(--b4n-text);
	}
	.btn-secondary:hover {
		background: var(--b4n-gold-muted);
		border-color: var(--b4n-gold-dim);
		color: var(--b4n-text-bright);
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
