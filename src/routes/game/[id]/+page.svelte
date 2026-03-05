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
	import type { GameJoinPayload, GameActionPayload } from '$lib/protocol';
	import type { Card } from '$lib/protocol';

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
						const fullDeck = await buildDeck(seed, payload.playerSeed);
						deck.set(fullDeck);
						const initial = buildInitialState(fullDeck, gameId);
						state.set(initial);
						status.set('playing');
						await publishGameState(initial, relayList, gameId);
					},
					onState: () => {},
					onAction: async (payload: GameActionPayload, _fromPubkey: string) => {
						const st = get(state);
						const d = get(deck);
						if (!st || !d || st.phase !== 'playing') return;
						const next = applyAction(st, payload.action, d, seed);
						state.set(next);
						await publishGameState(next, relayList, gameId);
					}
				})
			);
			status.set('waiting');
		} catch (e) {
			status.set('error');
			error.set(e instanceof Error ? e.message : String(e));
		}
	}

	function cardLabel(c: string): string {
		const suit = c.slice(-1);
		const map: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
		return c.slice(0, -1) + (map[suit] ?? suit);
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
		<div class="game">
			<div class="hands">
				<div class="hand dealer">
					<span class="label">Dealer</span>
					<div class="cards">
						{#each $state.dealerHand as card}
							<span class="card">{cardLabel(card)}</span>
						{/each}
					</div>
					<span class="value">{handValue($state.dealerHand)}</span>
				</div>
				<div class="hand player">
					<span class="label">Player</span>
					<div class="cards">
						{#each $state.playerHand as card}
							<span class="card">{cardLabel(card)}</span>
						{/each}
					</div>
					<span class="value">{handValue($state.playerHand)}</span>
				</div>
			</div>
			{#if $state.phase === 'finished'}
				<p class="result">
					{$state.winner === 'player' ? 'Player wins' : $state.winner === 'dealer' ? 'Dealer wins' : 'Push'}
				</p>
				{#if $state.dealerSeedReveal}
					<p class="muted small">Seed revealed — provably fair.</p>
				{/if}
			{:else}
				<p class="muted">Waiting for player action (hit/stand)…</p>
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
	.hands .hand {
		margin-bottom: 1rem;
	}
	.label {
		display: block;
		font-size: 0.75rem;
		color: #94a3b8;
		margin-bottom: 0.25rem;
	}
	.cards {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.cards .card {
		background: #0f172a;
		padding: 0.4rem 0.6rem;
		border-radius: 4px;
		font-size: 0.95rem;
	}
	.value {
		font-size: 0.85rem;
		color: #cbd5e1;
		margin-top: 0.25rem;
	}
	.result {
		font-weight: 600;
		margin-top: 0.75rem;
	}
</style>
