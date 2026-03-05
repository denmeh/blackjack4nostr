<script lang="ts">
	import { getNostrSdk, isNostrReady } from '$lib/nostr';

	let status = $state('');
	let result = $state<{
		eventId?: string;
		success?: string[];
		failed?: Array<{ url: string; error: string }>;
	} | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function runNostrTest() {
		loading = true;
		error = null;
		result = null;
		status = 'Generating keys...';

		try {
			const { Keys, Client, EventBuilder, NostrSigner } = await getNostrSdk();

			const keys = Keys.generate();
			const signer = NostrSigner.keys(keys);
			const client = new Client(signer);

			status = 'Connecting to relay...';
			await client.addRelay('wss://relay.damus.io');
			await client.connect();

			status = 'Publishing test note...';
			const builder = EventBuilder.textNote('Hello, rust-nostr! (from blackjack4nostr)');
			const output = await client.sendEventBuilder(builder);

			result = {
				eventId: output.id.toBech32(),
				success: [...(output.success || [])],
				failed: (output.failed || []).map((f: { url: string; error: string }) => ({
					url: f.url,
					error: f.error
				}))
			};
			status = 'Done.';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			status = 'Error.';
		} finally {
			loading = false;
		}
	}
</script>

<main>
	<h1>Blackjack4Nostr</h1>
	<p>Test the <a href="https://rust-nostr.org/sdk/install.html" target="_blank" rel="noopener">@rust-nostr/nostr-sdk</a> (TypeScript/JavaScript).</p>

	<button onclick={runNostrTest} disabled={loading || !$isNostrReady}>
		{#if !$isNostrReady}
			Loading Nostr…
		{:else if loading}
			{status}
		{:else}
			Run Nostr test
		{/if}
	</button>

	{#if error}
		<p class="error"><strong>Error:</strong> {error}</p>
	{/if}

	{#if result}
		<dl class="result">
			<dt>Event ID (note1…)</dt>
			<dd><code>{result.eventId}</code></dd>
			<dt>Sent to</dt>
			<dd>{result.success?.length ? result.success.join(', ') : '—'}</dd>
			<dt>Not sent to</dt>
			<dd>
				{result.failed?.length
					? result.failed.map((f) => `${f.url}: ${f.error}`).join('; ')
					: '—'}
			</dd>
		</dl>
	{/if}
</main>

<style>
	main {
		max-width: 36rem;
		margin: 0 auto;
		padding: 1rem;
		font-family: system-ui, sans-serif;
		color: #f1f5f9;
	}
	h1 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}
	a {
		color: #93c5fd;
	}
	a:hover {
		color: #bfdbfe;
	}
	button {
		padding: 0.5rem 1rem;
		font-size: 1rem;
		cursor: pointer;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.8;
	}
	.error {
		color: #f87171;
		margin-top: 1rem;
	}
	.result {
		margin-top: 1.5rem;
		padding: 1rem;
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 8px;
		color: #e2e8f0;
	}
	.result dt {
		font-weight: 600;
		margin-top: 0.5rem;
		color: #94a3b8;
	}
	.result dt:first-child {
		margin-top: 0;
	}
	.result dd {
		margin-left: 0;
		margin-bottom: 0.25rem;
		color: #f1f5f9;
	}
	.result code {
		font-size: 0.85em;
		word-break: break-all;
		background: #334155;
		color: #e2e8f0;
		padding: 0.15em 0.4em;
		border-radius: 4px;
	}
</style>
