<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { writable, get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import {
		subscribeGameEvents,
		publishGameState
	} from '$lib/game/events';
	import { buildDeck, buildInitialState, applyAction } from '$lib/game/engine';
	import { handValue } from '$lib/protocol/game-logic';
	import type { GameStatePayload } from '$lib/protocol/types';
	import type { GameJoinPayload, GameActionPayload, GamePlayAgainPayload } from '$lib/protocol';
	import type { Card } from '$lib/protocol';
	import GameCard from '$lib/components/Card.svelte';

	const gameId = $page.params.id as string;
	const role = $page.url.searchParams.get('role'); // 'dealer'
	const isDealer = role === 'dealer';

	let status = writable<'loading' | 'waiting' | 'playing' | 'error'>('loading');
	let error = writable<string | null>(null);
	let state = writable<GameStatePayload | null>(null);
	let shareUrl = writable('');
	let deck = writable<Card[] | null>(null);
	let dealerSeed = writable<string | null>(null);
	let relays = writable<string[]>([]);
	let unsub = writable<(() => void) | null>(null);
	/** Prevents processing duplicate play_again events (e.g. from multiple relays) */
	let processingPlayAgain = writable(false);

	onMount(() => {
		if (!isDealer) {
			goto('/');
			return;
		}
		const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('b4n_relays_' + gameId) : null;
		const relayList = stored ? (JSON.parse(stored) as string[]) : ['wss://relay.damus.io', 'wss://nos.lol'];
		relays.set(relayList);
		const seed = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('b4n_dealer_seed_' + gameId) : null;
		dealerSeed.set(seed);
		if (!seed) {
			status.set('error');
			error.set('Dealer session not found. Host a new game from the dashboard.');
			return;
		}
		const npubStored = typeof localStorage !== 'undefined' ? localStorage.getItem('b4n_npub') : null;
		if (npubStored && relayList.length) {
			const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('b4n_token_' + gameId) : null;
			if (token) {
				shareUrl.set(
					(typeof window !== 'undefined' ? window.location.origin : '') +
						'/join?npub=' +
						encodeURIComponent(npubStored) +
						'&token=' +
						encodeURIComponent(token) +
						'&relays=' +
						encodeURIComponent(relayList.join(','))
				);
			}
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
			unsub.set(
				await subscribeGameEvents(gameId, relayList, {
					onJoin: async (payload: GameJoinPayload, _fromPubkey: string) => {
						if (get(state)) return; // already started
						try {
							if (!payload?.playerSeed || typeof payload.playerSeed !== 'string' || payload.playerSeed.length < 32) {
								throw new Error('Invalid join: missing or invalid player seed. Ask the player to join again.');
							}
							const fullDeck = await buildDeck(seed, payload.playerSeed);
							deck.set(fullDeck);
							const initial = buildInitialState(fullDeck, gameId);
							state.set(initial);
							status.set('playing');
							error.set(null);
							try {
								await publishGameState(initial, relayList, gameId);
							} catch (relayErr) {
								error.set(
									'Game started but could not sync to relay. Player may not see the table. ' +
										(relayErr instanceof Error ? relayErr.message : String(relayErr))
								);
							}
						} catch (e) {
							status.set('error');
							error.set(e instanceof Error ? e.message : String(e));
						}
					},
					onState: () => {},
					onAction: async (payload: GameActionPayload, _fromPubkey: string) => {
						const st = get(state);
						const d = get(deck);
						const currentSeed = get(dealerSeed) ?? '';
						if (!st || !d || st.phase !== 'playing') return;
						const next = applyAction(st, payload.action, d, currentSeed);
						state.set(next);
						error.set(null);
						try {
							await publishGameState(next, relayList, gameId);
						} catch (relayErr) {
							error.set(
								'Result not synced to relay. ' +
									(relayErr instanceof Error ? relayErr.message : String(relayErr))
							);
						}
					},
					onPlayAgain: async (payload: GamePlayAgainPayload, _fromPubkey: string) => {
						if (get(processingPlayAgain)) return;
						const st = get(state);
						if (st?.phase !== 'finished') return;
						if (!payload?.playerSeed || typeof payload.playerSeed !== 'string' || payload.playerSeed.length < 32) {
							return;
						}
						processingPlayAgain.set(true);
						try {
							const newDealerSeed = Array.from(crypto.getRandomValues(new Uint8Array(32)))
								.map((b) => b.toString(16).padStart(2, '0'))
								.join('');
							if (typeof sessionStorage !== 'undefined') {
								sessionStorage.setItem('b4n_dealer_seed_' + gameId, newDealerSeed);
							}
							dealerSeed.set(newDealerSeed);
							const fullDeck = await buildDeck(newDealerSeed, payload.playerSeed);
							deck.set(fullDeck);
							const initial = buildInitialState(fullDeck, gameId);
							state.set(initial);
							error.set(null);
							try {
								await publishGameState(initial, relayList, gameId);
							} catch (relayErr) {
								error.set(
									'New hand started but could not sync to relay. ' +
										(relayErr instanceof Error ? relayErr.message : String(relayErr))
								);
							}
						} catch (e) {
							error.set(e instanceof Error ? e.message : String(e));
						} finally {
							processingPlayAgain.set(false);
						}
					}
				})
			);
			status.set('waiting');
		} catch (e) {
			status.set('error');
			error.set(e instanceof Error ? e.message : String(e));
		}
	}

	function copyLink() {
		const url = get(shareUrl);
		if (url && typeof navigator !== 'undefined') {
			navigator.clipboard.writeText(url);
		}
	}
</script>

<svelte:head>
	<title>Game – Blackjack4Nostr</title>
</svelte:head>

<main class="game-page">
	<h1>Dealer — Game</h1>

	{#if $status === 'error'}
		<p class="error">{$error}</p>
		<a href="/">Back to dashboard</a>
	{:else if $status === 'waiting'}
		<p class="muted">Waiting for a player to join. Share this link:</p>
		{#if $shareUrl}
			<div class="share-row">
				<input type="text" readonly value={$shareUrl} />
				<button onclick={copyLink}>Copy</button>
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
		max-width: 24rem;
		margin: 0 auto;
		padding: 1.5rem;
		font-family: system-ui, sans-serif;
		color: #f1f5f9;
	}
	h1 {
		font-size: 1.25rem;
		margin-bottom: 1rem;
	}
	.muted {
		color: #94a3b8;
		font-size: 0.9rem;
	}
	.small {
		font-size: 0.8rem;
		margin-top: 0.5rem;
	}
	.error {
		color: #f87171;
		font-size: 0.9rem;
		margin: 0.5rem 0;
	}
	.relay-warning {
		margin-top: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: rgba(234, 179, 8, 0.2);
		border-radius: 6px;
		color: #fde047;
		font-size: 0.85rem;
	}
	.back {
		display: inline-block;
		margin-top: 1rem;
		color: #94a3b8;
		font-size: 0.9rem;
	}
	.share-row {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}
	.share-row input {
		flex: 1;
		padding: 0.5rem;
		font-size: 0.8rem;
		background: #0f172a;
		border: 1px solid #334155;
		border-radius: 6px;
		color: #e2e8f0;
	}
	button {
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
		cursor: pointer;
		background: #475569;
		border: none;
		border-radius: 6px;
		color: #fff;
	}
	button:hover {
		background: #64748b;
	}
	.game {
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 10px;
		padding: 1.25rem;
		margin: 1rem 0;
	}
	.game.table {
		background: linear-gradient(160deg, #0d2818 0%, #134a2a 40%, #0f3320 100%);
		border: 3px solid #1a4722;
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
		color: rgba(255, 255, 255, 0.7);
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
		color: rgba(255, 255, 255, 0.9);
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
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.9);
	}
	.result-banner.win {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.4) 0%, rgba(22, 163, 74, 0.3) 100%);
		color: #86efac;
	}
	.result-banner:not(.win):not(.push) {
		background: rgba(248, 113, 113, 0.25);
		color: #fca5a5;
	}
	.result-banner.push {
		background: rgba(234, 179, 8, 0.25);
		color: #fde047;
	}
</style>
