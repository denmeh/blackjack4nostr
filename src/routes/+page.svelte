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
	<div class="hero">
		<h1><span class="hero-icon">♠</span> Blackjack<span class="hero-accent">4Nostr</span></h1>
		<p class="subtitle">Provably fair blackjack on Nostr. Host a table or join with a link.</p>
	</div>

	<section class="card host">
		<h2><span class="card-icon">♦</span> Host a game</h2>
		<p>Create a table and share the <code>blackjack4nostr://</code> link. You’re the dealer.</p>
		<button class="btn btn-gold" onclick={hostGame} disabled={hostLoading}>
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
		<h2><span class="card-icon">♥</span> Join a game</h2>
		<p>Paste a game link — <code>blackjack4nostr://npub1…?relays=…&token=…</code></p>
		<div class="join-row">
			<input
				type="text"
				placeholder="blackjack4nostr://npub1…?relays=…&token=…"
				bind:value={joinLinkInput}
				onkeydown={(e) => e.key === 'Enter' && joinViaLink()}
			/>
			<button class="btn btn-primary" onclick={joinViaLink} disabled={!joinLinkInput.trim()}>Join</button>
		</div>
	</section>
</main>

<style>
	.dashboard {
		max-width: 32rem;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		color: var(--b4n-text);
	}
	.hero {
		text-align: center;
		margin-bottom: 2rem;
	}
	.hero h1 {
		font-size: 1.85rem;
		font-weight: 700;
		margin: 0 0 0.4rem 0;
		letter-spacing: 0.02em;
		color: var(--b4n-text-bright);
	}
	.hero-icon {
		color: var(--b4n-gold);
		margin-right: 0.15em;
	}
	.hero-accent {
		color: var(--b4n-gold);
		font-weight: 600;
	}
	.subtitle {
		color: var(--b4n-text-muted);
		font-size: 0.95rem;
		margin: 0;
		line-height: 1.45;
	}
	.card {
		background: var(--b4n-surface);
		border: 1px solid var(--b4n-border);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1.25rem;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
	}
	.card h2 {
		font-size: 1.15rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
		color: var(--b4n-text-bright);
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.card-icon {
		color: var(--b4n-gold);
		opacity: 0.9;
	}
	.card p {
		color: var(--b4n-text-muted);
		font-size: 0.9rem;
		margin-bottom: 1rem;
		line-height: 1.5;
	}
	.card p code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--b4n-input-bg);
		color: var(--b4n-gold-dim);
		padding: 0.15em 0.4em;
		border-radius: 4px;
		border: 1px solid var(--b4n-input-border);
	}
	.btn {
		padding: 0.65rem 1.25rem;
		min-height: var(--b4n-touch-min, 44px);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		border: none;
		border-radius: 8px;
		transition: background 0.15s, transform 0.1s;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.btn:active:not(:disabled) {
		transform: scale(0.98);
	}
	.btn-gold {
		width: 100%;
		background: linear-gradient(180deg, var(--b4n-gold) 0%, var(--b4n-gold-dim) 100%);
		color: #0a0f0d;
		box-shadow: 0 2px 8px rgba(212, 168, 83, 0.35);
	}
	.btn-gold:hover:not(:disabled) {
		background: linear-gradient(180deg, var(--b4n-gold-bright) 0%, var(--b4n-gold) 100%);
		box-shadow: 0 4px 12px rgba(212, 168, 83, 0.4);
	}
	.btn-primary {
		background: var(--b4n-stand);
		color: #fff;
		flex-shrink: 0;
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--b4n-stand-hover);
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.error {
		color: var(--b4n-lose);
		font-size: 0.9rem;
		margin-top: 0.75rem;
	}
	.join-row {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.join-row input {
		flex: 1;
		min-width: 0;
		padding: 0.6rem 0.85rem;
		min-height: var(--b4n-touch-min, 44px);
		box-sizing: border-box;
		font-size: 0.9rem;
		font-family: var(--font-mono);
		background: var(--b4n-input-bg);
		border: 1px solid var(--b4n-input-border);
		border-radius: 8px;
		color: var(--b4n-text);
	}
	.join-row input::placeholder {
		color: var(--b4n-text-muted);
	}
	.join-row input:focus {
		outline: none;
		border-color: var(--b4n-gold-muted);
		box-shadow: 0 0 0 2px rgba(212, 168, 83, 0.15);
	}
	@media (max-width: 380px) {
		.dashboard {
			padding: 1.25rem 1rem;
		}
		.hero h1 {
			font-size: 1.5rem;
		}
		.join-row {
			flex-direction: column;
		}
		.join-row .btn-primary {
			width: 100%;
		}
	}
</style>
