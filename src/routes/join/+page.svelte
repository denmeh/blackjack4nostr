<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { writable, get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { getNostrSdk } from '$lib/nostr';
	import { fetchGameCreate, publishGameJoin, subscribeGameEvents, publishGameAction } from '$lib/game/events';
	import { PublicKey } from '@rust-nostr/nostr-sdk';
	import { handValue } from '$lib/protocol/game-logic';
	import type { GameStatePayload } from '$lib/protocol/types';

	const npub = $page.url.searchParams.get('npub');
	const token = $page.url.searchParams.get('token');
	const relaysParam = $page.url.searchParams.get('relays');
	const relays = relaysParam ? relaysParam.split(',').map((r) => r.trim()).filter(Boolean) : [];

	let status = writable<'loading' | 'ready' | 'joined' | 'error'>('loading');
	let error = writable<string | null>(null);
	let gameEventId = writable<string | null>(null);
	let state = writable<GameStatePayload | null>(null);
	let unsub = writable<(() => void) | null>(null);
	/** True after player sent hit/stand, until we receive final state */
	let waitingForResult = writable(false);

	onMount(() => {
		console.log('[b4n] join page onMount', { npub: !!npub, token: !!token, relaysCount: relays.length, relays });
		if (!npub || !token || relays.length === 0) {
			status.set('error');
			error.set('Missing npub, token, or relays. Use the link from the game host.');
			return;
		}
		loadGame();
		return () => {
			const u = get(unsub);
			if (u) u();
		};
	});

	async function loadGame() {
		console.log('[b4n] join loadGame: start');
		status.set('loading');
		error.set(null);
		try {
			const result = await fetchGameCreate(npub!, token!, relays, 8000);
			console.log('[b4n] join loadGame: fetchGameCreate result', result ? 'ok' : 'null');
			if (!result) {
				status.set('error');
				error.set('Game not found. Check the link and relays.');
				return;
			}
			gameEventId.set(result.eventId);
			status.set('ready');
		} catch (e) {
			console.log('[b4n] join loadGame: error', e);
			status.set('error');
			error.set(e instanceof Error ? e.message : String(e));
		}
	}

	async function joinGame() {
		const gid = get(gameEventId);
		console.log('[b4n] join joinGame: start', { gameEventId: gid, npub: !!npub });
		if (!gid || !npub) return;
		status.set('loading');
		error.set(null);
		try {
			const sdk = await getNostrSdk();
			const dealerPubkey = PublicKey.parse(npub);
			const playerSeed = Array.from(crypto.getRandomValues(new Uint8Array(32)))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');
			await publishGameJoin(
				{
					gameEventId: gid,
					dealerNpub: npub,
					playerSeed,
					createdAt: Math.floor(Date.now() / 1000)
				},
				relays,
				gid,
				dealerPubkey
			);
			const u = await subscribeGameEvents(gid, relays, {
				onState: (s) => {
					state.set(s);
					// Clear waiting after any state so buttons reappear after a non-bust hit
					waitingForResult.set(false);
				}
			});
			unsub.set(u);
			status.set('joined');
			console.log('[b4n] join joinGame: success');
		} catch (e) {
			console.log('[b4n] join joinGame: error', e);
			status.set('ready');
			error.set(e instanceof Error ? e.message : String(e));
		}
	}

	async function sendAction(action: 'hit' | 'stand') {
		const gid = get(gameEventId);
		const st = get(state);
		if (!gid || !npub || st?.phase !== 'playing') return;
		waitingForResult.set(true);
		try {
			const sdk = await getNostrSdk();
			const dealerPubkey = PublicKey.parse(npub);
			await publishGameAction(
				{
					gameEventId: gid,
					action,
					createdAt: Math.floor(Date.now() / 1000)
				},
				relays,
				gid,
				dealerPubkey
			);
		} catch (e) {
			waitingForResult.set(false);
			error.set(e instanceof Error ? e.message : String(e));
		}
	}

	function cardLabel(c: string): string {
		const suit = c.slice(-1);
		const map: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
		return c.slice(0, -1) + (map[suit] ?? suit);
	}
</script>

<svelte:head>
	<title>Join game – Blackjack4Nostr</title>
</svelte:head>

<main class="join-page">
	<h1>Join game</h1>

	{#if $status === 'error'}
		<p class="error">{$error}</p>
		<a href="/">Back to dashboard</a>
	{:else if $status === 'loading' && !$state}
		<p class="muted">Loading game…</p>
	{:else if $status === 'ready'}
		<p class="muted">Game found. Join as player.</p>
		<button onclick={joinGame} disabled={$status !== 'ready'}>Join game</button>
		{#if $error}<p class="error">{$error}</p>{/if}
	{:else if $status === 'joined' || $state}
		<div class="game">
			{#if $state}
				<div class="hands">
					<div class="hand dealer">
						<span class="label">Dealer</span>
						<div class="cards">
							{#each $state.dealerHand as card, i}
								<span class="card">
									{$state.phase === 'playing' && i === 1 ? '?' : cardLabel(card)}
								</span>
							{/each}
						</div>
						{#if $state.phase !== 'playing' || $state.dealerHand.length > 2}
							<span class="value">{handValue($state.dealerHand)}</span>
						{/if}
					</div>
					<div class="hand player">
						<span class="label">Your hand</span>
						<div class="cards">
							{#each $state.playerHand as card}
								<span class="card">{cardLabel(card)}</span>
							{/each}
						</div>
						<span class="value">{handValue($state.playerHand)}</span>
					</div>
				</div>
				{#if $state.phase === 'playing'}
					{#if $waitingForResult}
						<p class="muted waiting">Waiting for result…</p>
					{:else}
						<div class="actions">
							<button onclick={() => sendAction('hit')}>Hit</button>
							<button onclick={() => sendAction('stand')}>Stand</button>
						</div>
					{/if}
				{:else if $state.phase === 'finished'}
					<p class="result" role="status">
						{$state.winner === 'player' ? 'You win!' : $state.winner === 'dealer' ? 'Dealer wins.' : 'Push.'}
					</p>
					<p class="muted small">Dealer hand: {handValue($state.dealerHand)}</p>
					{#if $state.dealerSeedReveal}
						<p class="muted small">Dealer seed revealed — game was provably fair.</p>
					{/if}
				{/if}
			{:else}
				<p class="muted">Waiting for dealer to start…</p>
			{/if}
		</div>
		{#if $error}<p class="error">{$error}</p>{/if}
	{/if}

	<a href="/" class="back">← Dashboard</a>
</main>

<style>
	.join-page {
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
	button {
		padding: 0.5rem 1rem;
		font-size: 0.95rem;
		cursor: pointer;
		background: #475569;
		border: none;
		border-radius: 6px;
		color: #fff;
		margin-right: 0.5rem;
	}
	button:hover:not(:disabled) {
		background: #64748b;
	}
	button:disabled {
		opacity: 0.7;
	}
	.back {
		display: inline-block;
		margin-top: 1rem;
		color: #94a3b8;
		font-size: 0.9rem;
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
	.actions {
		margin-top: 1rem;
	}
	.result {
		font-weight: 600;
		margin-top: 0.75rem;
	}
	.waiting {
		margin-top: 0.75rem;
		font-style: italic;
	}
</style>
