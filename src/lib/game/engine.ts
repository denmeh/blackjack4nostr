/**
 * Dealer engine: given deck and current state, apply action and produce next state.
 * Used by host to advance the game.
 */

import { deckFromSeed } from '$lib/protocol/deck';
import { handValue, dealerMustHit, getWinner } from '$lib/protocol/game-logic';
import type { GameStatePayload, Card } from '$lib/protocol/types';

/** Full deck for the game (52 cards in order) */
export type Deck = Card[];

/** Build initial state after player join: deal 2 to player, 2 to dealer (one hidden in UI). */
export function buildInitialState(
	deck: Deck,
	gameEventId: string
): GameStatePayload {
	if (!Array.isArray(deck) || deck.length < 4) {
		throw new Error(`Deck too short for initial deal (got ${deck?.length ?? 0} cards, need 4)`);
	}
	const c = (i: number) => deck[i];
	if (!c(0) || !c(1) || !c(2) || !c(3)) {
		throw new Error(
			`Deck too short for initial deal (length=${deck.length}, first cards: ${[c(0), c(1), c(2), c(3)].map((x) => String(x)).join(',')})`
		);
	}
	const playerHand = [c(0)!, c(1)!];
	const dealerHand = [c(2)!, c(3)!];
	return {
		gameEventId,
		phase: 'playing',
		deckIndex: 4,
		playerHand,
		dealerHand,
		createdAt: Math.floor(Date.now() / 1000)
	};
}

/** Apply player action (hit or stand) and optionally run dealer turn; returns next state. */
export function applyAction(
	current: GameStatePayload,
	action: 'hit' | 'stand',
	deck: Deck,
	dealerSeedReveal?: string
): GameStatePayload {
	const next: GameStatePayload = {
		...current,
		playerHand: [...current.playerHand],
		dealerHand: [...current.dealerHand],
		createdAt: Math.floor(Date.now() / 1000)
	};

	if (current.phase !== 'playing') return current;

	if (action === 'hit') {
		const card = deck[current.deckIndex];
		if (card == null) {
			throw new Error('Deck exhausted');
		}
		next.playerHand.push(card);
		next.deckIndex = current.deckIndex + 1;
		if (handValue(next.playerHand) > 21) {
			// Player bust — game over
			next.phase = 'finished';
			next.winner = 'dealer';
			next.dealerSeedReveal = dealerSeedReveal;
		}
		return next;
	}

	// stand
	next.phase = 'dealer_turn';
	// Run dealer: hit until 17+ (use only valid cards for dealer hand)
	let di = current.deckIndex;
	let dHand = [...(current.dealerHand || [])].filter((c): c is Card => c != null && typeof c === 'string' && c.length >= 2);
	while (dealerMustHit(dHand)) {
		const card = deck[di];
		if (card == null) {
			throw new Error('Deck exhausted during dealer turn');
		}
		dHand.push(card);
		di++;
	}
	next.dealerHand = dHand;
	next.deckIndex = di;
	next.phase = 'finished';
	next.winner = getWinner(next.playerHand, dHand);
	next.dealerSeedReveal = dealerSeedReveal;
	return next;
}

/** Build deck from seeds (call after receiving player join). */
export async function buildDeck(dealerSeed: string, playerSeed: string): Promise<Deck> {
	const d = String(dealerSeed ?? '').trim();
	const p = String(playerSeed ?? '').trim();
	if (!d) throw new Error('Dealer seed is required to build deck');
	if (!p) throw new Error('Player seed is required to build deck (join payload may be invalid)');
	const fullDeck = await deckFromSeed(d, p);
	if (!Array.isArray(fullDeck) || fullDeck.length < 52) {
		throw new Error(`Deck build failed: expected 52 cards, got ${fullDeck?.length ?? 0}`);
	}
	return fullDeck;
}
