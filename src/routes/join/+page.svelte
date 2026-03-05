<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { writable, get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { getNostrSdk } from '$lib/nostr';
	import { fetchGameCreate, publishGameJoin, subscribeGameEvents, publishGameAction, publishPlayAgain } from '$lib/game/events';
	import { PublicKey } from '@rust-nostr/nostr-sdk';
	import { handValue } from '$lib/protocol/game-logic';
	import type { GameStatePayload } from '$lib/protocol/types';
	import GameCard from '$lib/components/Card.svelte';

	const npub = $page.url.searchParams.get('npub');
	const token = $page.url.searchParams.get('token');
	const relaysParam = $page.url.searchParams.get('relays');
	const relays = relaysParam ? relaysParam.split(',').map((r) => r.trim()).filter(Boolean) : [];

	let status = writable<'loading' | 'ready' | 'joined' | 'error'>('loading');
	let error = writable<string | null>(null);
	let gameEventId = writable<string | null>(null);
	let gameState = writable<GameStatePayload | null>(null);
	let unsub = writable<(() => void) | null>(null);
	/** True after player sent hit/stand, until we receive final state */
	let waitingForResult = writable(false);
	/** Timeout id for "play again" so we can clear it when state arrives or after 20s */
	let playAgainTimeoutId: ReturnType<typeof setTimeout> | 0 = 0;

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
					gameState.set(s);
					waitingForResult.set(false);
					if (playAgainTimeoutId) {
						clearTimeout(playAgainTimeoutId);
						playAgainTimeoutId = 0;
					}
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
		const st = get(gameState);
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

	let playAgainLoading = $state(false);

	async function requestPlayAgain() {
		const gid = get(gameEventId);
		if (!gid || !npub) return;
		playAgainLoading = true;
		error.set(null);
		try {
			const dealerPubkey = PublicKey.parse(npub);
			const playerSeed = Array.from(crypto.getRandomValues(new Uint8Array(32)))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');
			await publishPlayAgain(
				{
					gameEventId: gid,
					playerSeed,
					createdAt: Math.floor(Date.now() / 1000)
				},
				relays,
				gid,
				dealerPubkey
			);
			waitingForResult.set(true);
			if (playAgainTimeoutId) clearTimeout(playAgainTimeoutId);
			playAgainTimeoutId = setTimeout(() => {
				playAgainTimeoutId = 0;
				waitingForResult.set(false);
				error.set('New hand didn’t arrive (relay may be slow or rate-limited). Try Play again again.');
			}, 20_000);
		} catch (e) {
			error.set(e instanceof Error ? e.message : String(e));
		} finally {
			playAgainLoading = false;
		}
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
	{:else if $status === 'loading' && !$gameState}
		<p class="muted">Loading game…</p>
	{:else if $status === 'ready'}
		<p class="muted">Game found. Join as player.</p>
		<button onclick={joinGame} disabled={$status !== 'ready'}>Join game</button>
		{#if $error}<p class="error">{$error}</p>{/if}
	{:else if $status === 'joined' || $gameState}
		<div class="game table">
			{#if $gameState}
				<div class="hands">
					<div class="hand dealer">
						<span class="label">Dealer</span>
						<div class="cards">
							{#each $gameState.dealerHand as card, i}
								<GameCard
									card={card}
									faceDown={$gameState.phase === 'playing' && i === 1}
								/>
							{/each}
						</div>
						{#if $gameState.phase !== 'playing' || $gameState.dealerHand.length > 2}
							<span class="value">{handValue($gameState.dealerHand)}</span>
						{/if}
					</div>
					<div class="hand player">
						<span class="label">Your hand</span>
						<div class="cards">
							{#each $gameState.playerHand as card}
								<GameCard {card} />
							{/each}
						</div>
						<span class="value">{handValue($gameState.playerHand)}</span>
					</div>
				</div>
				{#if $gameState.phase === 'playing'}
					{#if $waitingForResult}
						<p class="muted waiting">Waiting for result…</p>
					{:else}
						<div class="actions">
							<button class="action hit" onclick={() => sendAction('hit')}>Hit</button>
							<button class="action stand" onclick={() => sendAction('stand')}>Stand</button>
						</div>
					{/if}
				{:else if $gameState.phase === 'finished'}
					<div class="result-banner" class:win={$gameState.winner === 'player'} class:push={$gameState.winner === 'push'} role="status">
						{$gameState.winner === 'player' ? 'You win!' : $gameState.winner === 'dealer' ? 'Dealer wins.' : 'Push.'}
					</div>
					<p class="muted small">Dealer hand: {handValue($gameState.dealerHand)}</p>
					{#if $gameState.dealerSeedReveal}
						<p class="muted small">Dealer seed revealed — game was provably fair.</p>
					{/if}
					<div class="actions">
						<button
							class="action play-again"
							onclick={requestPlayAgain}
							disabled={playAgainLoading || $waitingForResult}
						>
							{#if playAgainLoading || $waitingForResult}
								{#if $waitingForResult}Waiting for new hand…{:else}Requesting…{/if}
							{:else}
								Play again
							{/if}
						</button>
					</div>
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
	.actions {
		margin-top: 1.25rem;
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		flex-wrap: wrap;
	}
	.action {
		min-width: 5rem;
		padding: 0.65rem 1.25rem;
		font-size: 1rem;
		font-weight: 600;
		border-radius: 8px;
		border: none;
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}
	.action.hit {
		background: linear-gradient(180deg, #dc2626 0%, #b91c1c 100%);
		color: #fff;
	}
	.action.hit:hover {
		background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%);
	}
	.action.stand {
		background: linear-gradient(180deg, #15803d 0%, #166534 100%);
		color: #fff;
	}
	.action.stand:hover {
		background: linear-gradient(180deg, #22c55e 0%, #15803d 100%);
	}
	.action.play-again {
		background: linear-gradient(180deg, #b45309 0%, #92400e 100%);
		color: #fff;
	}
	.action.play-again:hover:not(:disabled) {
		background: linear-gradient(180deg, #d97706 0%, #b45309 100%);
	}
	.action.play-again:disabled {
		opacity: 0.8;
		cursor: not-allowed;
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
	.waiting {
		margin-top: 0.75rem;
		font-style: italic;
	}
</style>
