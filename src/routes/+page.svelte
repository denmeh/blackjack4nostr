<script lang="ts">
	import { goto } from '$app/navigation';
	import { npub } from '$lib/session';
	import { buildJoinWebUrl, DEFAULT_RELAYS, parseGameLink } from '$lib/protocol';
	import { sha256Hex } from '$lib/protocol/deck';
	import { publishGameCreate } from '$lib/game/events';

	let hostLoading = $state(false);
	let hostError = $state<string | null>(null);
	let gameLink = $state<string | null>(null);
	let gameEventId = $state<string | null>(null);
	let joinLinkInput = $state('');

	async function hostGame() {
		console.log('[b4n] hostGame: start');
		hostLoading = true;
		hostError = null;
		gameLink = null;
		gameEventId = null;
		try {
			const myNpub = $npub;
			console.log('[b4n] hostGame: npub', myNpub ? 'ok' : 'missing');
			if (!myNpub) throw new Error('Not logged in');

			const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');
			const dealerSeed = Array.from(crypto.getRandomValues(new Uint8Array(32)))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');
			const dealerSeedHash = await sha256Hex(dealerSeed);
			console.log('[b4n] hostGame: token and seed ready, DEFAULT_RELAYS', DEFAULT_RELAYS);

			const payload = {
				token,
				relays: DEFAULT_RELAYS,
				dealerSeedHash,
				createdAt: Math.floor(Date.now() / 1000)
			};

			const createPromise = publishGameCreate(payload, DEFAULT_RELAYS);
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('Connection timed out. Relays may be unreachable. Try again.')), 20_000);
			});
			const { eventId } = await Promise.race([createPromise, timeoutPromise]);
			console.log('[b4n] hostGame: game created', eventId);
			gameEventId = eventId;
			const params = { npub: myNpub, relays: DEFAULT_RELAYS, token };
			gameLink = buildJoinWebUrl(params);
			if (typeof sessionStorage !== 'undefined') {
				sessionStorage.setItem('b4n_dealer_seed_' + eventId, dealerSeed);
				sessionStorage.setItem('b4n_token_' + eventId, token);
				sessionStorage.setItem('b4n_relays_' + eventId, JSON.stringify(DEFAULT_RELAYS));
			}
			goto('/game/' + encodeURIComponent(eventId) + '?role=dealer');
		} catch (e) {
			console.log('[b4n] hostGame: error', e);
			hostError = e instanceof Error ? e.message : String(e);
		} finally {
			hostLoading = false;
			console.log('[b4n] hostGame: done');
		}
	}

	function joinViaLink() {
		const link = joinLinkInput.trim();
		if (!link) return;
		const params = parseGameLink(link);
		if (params) {
			goto(
				'/join?npub=' +
					encodeURIComponent(params.npub) +
					'&token=' +
					encodeURIComponent(params.token) +
					'&relays=' +
					encodeURIComponent(params.relays.join(','))
			);
		} else if (link.includes('/join?')) {
			try {
				const u = new URL(link.startsWith('http') ? link : window.location.origin + link);
				goto(u.pathname + u.search);
			} catch {
				// ignore
			}
		}
	}
</script>

<main class="dashboard">
	<h1>Blackjack4Nostr</h1>
	<p class="subtitle">Provably fair blackjack over Nostr. Host a game or join with a link.</p>

	<section class="card host">
		<h2>Host a game</h2>
		<p>Create a game and share the link. You’re the dealer.</p>
		<button onclick={hostGame} disabled={hostLoading}>
			{#if hostLoading}
				Creating…
			{:else}
				Host game
			{/if}
		</button>
		{#if hostError}
			<p class="error">{hostError}</p>
		{/if}
	</section>

	<section class="card join">
		<h2>Join a game</h2>
		<p>Paste a game link (e.g. blackjack4nostr://… or the web join URL).</p>
		<div class="join-row">
			<input
				type="text"
				placeholder="blackjack4nostr://npub1…?relays=…&token=…"
				bind:value={joinLinkInput}
				onkeydown={(e) => e.key === 'Enter' && joinViaLink()}
			/>
			<button onclick={joinViaLink} disabled={!joinLinkInput.trim()}>Join</button>
		</div>
	</section>
</main>

<style>
	.dashboard {
		max-width: 28rem;
		margin: 0 auto;
		padding: 1.5rem;
		font-family: system-ui, sans-serif;
		color: #f1f5f9;
	}
	h1 {
		font-size: 1.5rem;
		margin-bottom: 0.25rem;
	}
	.subtitle {
		color: #94a3b8;
		font-size: 0.9rem;
		margin-bottom: 1.5rem;
	}
	.card {
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 10px;
		padding: 1.25rem;
		margin-bottom: 1rem;
	}
	.card h2 {
		font-size: 1.1rem;
		margin-bottom: 0.35rem;
	}
	.card p {
		color: #94a3b8;
		font-size: 0.85rem;
		margin-bottom: 0.75rem;
	}
	button {
		padding: 0.5rem 1rem;
		font-size: 0.95rem;
		cursor: pointer;
		background: #475569;
		border: none;
		border-radius: 6px;
		color: #fff;
	}
	button:hover:not(:disabled) {
		background: #64748b;
	}
	button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}
	.error {
		color: #f87171;
		font-size: 0.85rem;
		margin-top: 0.5rem;
	}
	.join-row {
		display: flex;
		gap: 0.5rem;
	}
	.join-row input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		font-size: 0.9rem;
		background: #0f172a;
		border: 1px solid #334155;
		border-radius: 6px;
		color: #f1f5f9;
	}
	.join-row input::placeholder {
		color: #64748b;
	}
</style>
