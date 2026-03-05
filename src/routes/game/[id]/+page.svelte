<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { writable, get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { subscribeGameEvents, publishGameState } from '$lib/game/events';
	import { buildDeck, buildInitialState, applyAction } from '$lib/game/engine';
	import { handValue } from '$lib/protocol/game-logic';
	import type { GameStatePayload } from '$lib/protocol/types';
	import type { GameJoinPayload, GameActionPayload, GamePlayAgainPayload } from '$lib/protocol';
	import type { Card } from '$lib/protocol';
	import GameCard from '$lib/components/Card.svelte';
	import { DEFAULT_RELAYS, buildGameLink } from '$lib/protocol/link';
	import { generateRandomHexSeed } from '$lib/random';

	const gameId = $page.params.id as string;
	const isDealer = $page.url.searchParams.get('role') === 'dealer';

	let status = writable<'loading' | 'waiting' | 'playing' | 'error'>('loading');
	let error = writable<string | null>(null);
	let state = writable<GameStatePayload | null>(null);
	let shareUrl = writable('');
	let deck = writable<Card[] | null>(null);
	let dealerSeed = writable<string | null>(null);
	let relays = writable<string[]>([]);
	let unsub = writable<(() => void) | null>(null);
	let processingPlayAgain = writable(false);

	function getErrorMessage(e: unknown): string {
		return e instanceof Error ? e.message : String(e);
	}

	function isValidPlayerSeed(seed: unknown): seed is string {
		return typeof seed === 'string' && seed.length >= 32;
	}

	async function syncStateToRelay(
		payload: GameStatePayload,
		relayList: string[],
		setError: (msg: string) => void,
		prefix: string
	): Promise<void> {
		try {
			await publishGameState(payload, relayList, gameId);
		} catch (e) {
			setError(prefix + getErrorMessage(e));
		}
	}

	onMount(() => {
		if (!isDealer) {
			goto('/');
			return;
		}
		const storedRelays = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('b4n_relays_' + gameId) : null;
		const relayList = storedRelays ? (JSON.parse(storedRelays) as string[]) : DEFAULT_RELAYS;
		relays.set(relayList);
		const seed = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('b4n_dealer_seed_' + gameId) : null;
		dealerSeed.set(seed);
		if (!seed) {
			status.set('error');
			error.set('Dealer session not found. Host a new game from the dashboard.');
			return;
		}
		const npubStored = typeof localStorage !== 'undefined' ? localStorage.getItem('b4n_npub') : null;
		const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('b4n_token_' + gameId) : null;
		if (npubStored && relayList.length && token) {
			shareUrl.set(buildGameLink({ npub: npubStored, token, relays: relayList }));
		}
		startSubscriptions();
		return () => {
			const u = get(unsub);
			if (u) u();
		};
	});

	async function startSubscriptions() {
		try {
			const relayList = get(relays);
			const seed = get(dealerSeed) ?? '';
			const setError = (msg: string) => error.set(msg);

			unsub.set(
				await subscribeGameEvents(gameId, relayList, {
					onJoin: async (payload: GameJoinPayload) => {
						if (get(state)) return;
						if (!isValidPlayerSeed(payload?.playerSeed)) {
							status.set('error');
							error.set('Invalid join: missing or invalid player seed. Ask the player to join again.');
							return;
						}
						try {
							const fullDeck = await buildDeck(seed, payload.playerSeed);
							deck.set(fullDeck);
							const initial = buildInitialState(fullDeck, gameId);
							state.set(initial);
							status.set('playing');
							error.set(null);
							await syncStateToRelay(initial, relayList, setError, 'Game started but could not sync to relay. Player may not see the table. ');
						} catch (e) {
							status.set('error');
							error.set(getErrorMessage(e));
						}
					},
					onState: () => {},
					onAction: async (payload: GameActionPayload) => {
						const st = get(state);
						const d = get(deck);
						const currentSeed = get(dealerSeed) ?? '';
						if (!st || !d || st.phase !== 'playing') return;
						const next = applyAction(st, payload.action, d, currentSeed);
						state.set(next);
						error.set(null);
						await syncStateToRelay(next, relayList, setError, 'Result not synced to relay. ');
					},
					onPlayAgain: async (payload: GamePlayAgainPayload) => {
						if (get(processingPlayAgain)) return;
						if (get(state)?.phase !== 'finished') return;
						if (!isValidPlayerSeed(payload?.playerSeed)) return;

						processingPlayAgain.set(true);
						try {
							const newDealerSeed = generateRandomHexSeed();
							if (typeof sessionStorage !== 'undefined') {
								sessionStorage.setItem('b4n_dealer_seed_' + gameId, newDealerSeed);
							}
							dealerSeed.set(newDealerSeed);
							const fullDeck = await buildDeck(newDealerSeed, payload.playerSeed);
							deck.set(fullDeck);
							const initial = buildInitialState(fullDeck, gameId);
							state.set(initial);
							error.set(null);
							await syncStateToRelay(initial, relayList, setError, 'New hand started but could not sync to relay. ');
						} catch (e) {
							error.set(getErrorMessage(e));
						} finally {
							processingPlayAgain.set(false);
						}
					}
				})
			);
			status.set('waiting');
		} catch (e) {
			status.set('error');
			error.set(getErrorMessage(e));
		}
	}

	function copyLink() {
		const url = get(shareUrl);
		if (url && typeof navigator !== 'undefined') navigator.clipboard.writeText(url);
	}
</script>

<svelte:head>
	<title>Game – Blackjack4Nostr</title>
</svelte:head>

<main class="game-page">
	<h1><span class="page-icon">♠</span> Dealer — Game</h1>

	{#if $status === 'error'}
		<p class="error">{$error}</p>
		<a href="/">Back to dashboard</a>
	{:else if $status === 'waiting'}
		<p class="muted">Waiting for a player. Share this <strong>B4N link</strong> (<code>blackjack4nostr://</code>):</p>
		{#if $shareUrl}
			<div class="share-row">
				<input type="text" readonly value={$shareUrl} aria-label="Game link" />
				<button class="btn btn-gold" onclick={copyLink}>Copy</button>
			</div>
		{:else}
			<p class="muted">Open this page from the dashboard after hosting to get the share link.</p>
		{/if}
	{:else if $state}
		<div class="game table">
			<div class="hands">
				<div class="hand dealer">
					<span class="label">Dealer</span>
					<div class="cards">
						{#each $state.dealerHand as card}
							<GameCard {card} />
						{/each}
					</div>
					<span class="value">{handValue($state.dealerHand)}</span>
				</div>
				<div class="hand player">
					<span class="label">Player</span>
					<div class="cards">
						{#each $state.playerHand as card}
							<GameCard {card} />
						{/each}
					</div>
					<span class="value">{handValue($state.playerHand)}</span>
				</div>
			</div>
			{#if $state.phase === 'finished'}
				<div
					class="result-banner"
					class:win={$state.winner === 'player'}
					class:push={$state.winner === 'push'}
					role="status"
				>
					{$state.winner === 'player' ? 'Player wins' : $state.winner === 'dealer' ? 'Dealer wins' : 'Push'}
				</div>
				{#if $state.dealerSeedReveal}
					<p class="muted small">Seed revealed — provably fair.</p>
				{/if}
			{:else}
				<p class="muted">Waiting for player action (hit/stand)…</p>
			{/if}
			{#if $state.phase === 'finished'}
				<p class="muted small">Player can click <strong>Play again</strong> for another hand.</p>
			{/if}
			{#if $error}
				<p class="relay-warning">{$error}</p>
			{/if}
		</div>
	{/if}

	<a href="/" class="back">← Dashboard</a>
</main>

<style>
	.game-page {
		max-width: 28rem;
		margin: 0 auto;
		padding: 1.5rem;
		color: var(--b4n-text);
	}
	h1 {
		font-size: 1.3rem;
		font-weight: 600;
		margin-bottom: 1rem;
		color: var(--b4n-text-bright);
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.page-icon {
		color: var(--b4n-gold);
	}
	.muted {
		color: var(--b4n-text-muted);
		font-size: 0.9rem;
	}
	.muted code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--b4n-input-bg);
		color: var(--b4n-gold-dim);
		padding: 0.1em 0.35em;
		border-radius: 4px;
	}
	.small {
		font-size: 0.8rem;
		margin-top: 0.5rem;
	}
	.error {
		color: var(--b4n-lose);
		font-size: 0.9rem;
		margin: 0.5rem 0;
	}
	.relay-warning {
		margin-top: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: rgba(201, 162, 39, 0.15);
		border: 1px solid var(--b4n-push);
		border-radius: 8px;
		color: var(--b4n-gold-dim);
		font-size: 0.85rem;
	}
	.back {
		display: inline-block;
		margin-top: 1rem;
		color: var(--b4n-text-muted);
		font-size: 0.9rem;
	}
	.back:hover {
		color: var(--b4n-gold-dim);
	}
	.share-row {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}
	.share-row input {
		flex: 1;
		padding: 0.55rem 0.75rem;
		font-size: 0.8rem;
		font-family: var(--font-mono);
		background: var(--b4n-input-bg);
		border: 1px solid var(--b4n-input-border);
		border-radius: 8px;
		color: var(--b4n-text);
	}
	.btn {
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		border: none;
		border-radius: 8px;
		flex-shrink: 0;
	}
	.btn-gold {
		background: linear-gradient(180deg, var(--b4n-gold) 0%, var(--b4n-gold-dim) 100%);
		color: #0a0f0d;
	}
	.btn-gold:hover {
		background: linear-gradient(180deg, var(--b4n-gold-bright) 0%, var(--b4n-gold) 100%);
	}
	.game {
		background: var(--b4n-surface);
		border: 1px solid var(--b4n-border);
		border-radius: 12px;
		padding: 1.25rem;
		margin: 1rem 0;
	}
	.game.table {
		background: linear-gradient(160deg, var(--b4n-felt) 0%, var(--b4n-felt-light) 40%, #0f3320 100%);
		border: 3px solid var(--b4n-felt-border);
		box-shadow:
			inset 0 0 80px rgba(0, 0, 0, 0.3),
			0 8px 24px rgba(0, 0, 0, 0.4);
	}
	.hands .hand {
		margin-bottom: 1.25rem;
	}
	.label {
		display: block;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.75);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 0.5rem;
	}
	.cards {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.value {
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.95);
		margin-top: 0.35rem;
		font-weight: 600;
	}
	.result-banner {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		text-align: center;
		font-weight: 700;
		font-size: 1.1rem;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.95);
	}
	.result-banner.win {
		background: linear-gradient(135deg, rgba(61, 155, 92, 0.45) 0%, rgba(45, 125, 74, 0.35) 100%);
		color: #86efac;
	}
	.result-banner:not(.win):not(.push) {
		background: rgba(199, 62, 62, 0.3);
		color: #fca5a5;
	}
	.result-banner.push {
		background: rgba(201, 162, 39, 0.3);
		color: #fde047;
	}
</style>
