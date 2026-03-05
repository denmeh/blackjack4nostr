/**
 * Dealer engine: given deck and current state, apply action and produce next state.
 */

import { deckFromSeed } from '$lib/protocol/deck';
import { handValue, dealerMustHit, getWinner, isBlackjack } from '$lib/protocol/game-logic';
import type { GameStatePayload, Card } from '$lib/protocol/types';

export type Deck = Card[];

function validCards(hand: Card[]): Card[] {
	return (hand || []).filter((c): c is Card => c != null && typeof c === 'string' && c.length >= 2);
}

/** Run dealer turn: hit until 17+. Returns final hand and next deck index. */
function runDealerTurn(deck: Deck, startIndex: number, dealerHand: Card[]): { hand: Card[]; nextDeckIndex: number } {
	let index = startIndex;
	const hand = [...validCards(dealerHand)];
	while (dealerMustHit(hand)) {
		const card = deck[index];
		if (card == null) throw new Error('Deck exhausted during dealer turn');
		hand.push(card);
		index++;
	}
	return { hand, nextDeckIndex: index };
}

/** Build initial state after player join: deal 2 to player, 2 to dealer. */
export function buildInitialState(deck: Deck, gameEventId: string): GameStatePayload {
	if (!Array.isArray(deck) || deck.length < 4) {
		throw new Error(`Deck too short for initial deal (got ${deck?.length ?? 0} cards, need 4)`);
	}
	const playerHand = [deck[0]!, deck[1]!];
	const dealerHand = [deck[2]!, deck[3]!];
	const createdAt = Math.floor(Date.now() / 1000);

	if (isBlackjack(dealerHand)) {
		return {
			gameEventId,
			phase: 'finished',
			deckIndex: 4,
			playerHand,
			dealerHand,
			winner: isBlackjack(playerHand) ? 'push' : 'dealer',
			createdAt
		};
	}

	return {
		gameEventId,
		phase: 'playing',
		deckIndex: 4,
		playerHand,
		dealerHand,
		createdAt
	};
}

/** Apply player action (hit or stand); on stand, runs dealer turn and sets winner. */
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
		if (card == null) throw new Error('Deck exhausted');
		next.playerHand.push(card);
		next.deckIndex = current.deckIndex + 1;
		if (handValue(next.playerHand) > 21) {
			next.phase = 'finished';
			next.winner = 'dealer';
			next.dealerSeedReveal = dealerSeedReveal;
		}
		return next;
	}

	const { hand: dealerHand, nextDeckIndex } = runDealerTurn(deck, current.deckIndex, current.dealerHand);
	next.dealerHand = dealerHand;
	next.deckIndex = nextDeckIndex;
	next.phase = 'finished';
	next.winner = getWinner(next.playerHand, dealerHand);
	next.dealerSeedReveal = dealerSeedReveal;
	return next;
}

/** Build deck from dealer and player seeds (call after player join). */
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
