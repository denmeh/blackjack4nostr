/**
 * Blackjack game logic: hand value, dealer rules, winner.
 * No double/split — hit and stand only.
 */

import type { Card } from './types';

/** Value of a card for total (J,Q,K = 10, A = 1 or 11). Safe for undefined/invalid. */
export function cardValue(c: Card | undefined): number {
	if (c == null || typeof c !== 'string' || c.length < 2) return 0;
	const rank = c.slice(0, -1);
	if (rank === 'A') return 11;
	if (['J', 'Q', 'K'].includes(rank)) return 10;
	return parseInt(rank, 10) || 0;
}

/** Best blackjack total (Aces as 11 until bust, then 1). Ignores invalid entries. */
export function handValue(hand: Card[]): number {
	let total = 0;
	let aces = 0;
	const valid = (hand || []).filter((c): c is Card => c != null && typeof c === 'string' && c.length >= 2);
	for (const c of valid) {
		const v = cardValue(c);
		total += v;
		if (v === 11) aces++;
	}
	while (total > 21 && aces > 0) {
		total -= 10;
		aces--;
	}
	return total;
}

/** True if hand is exactly 21 with 2 cards (blackjack) */
export function isBlackjack(hand: Card[]): boolean {
	return hand.length === 2 && handValue(hand) === 21;
}

/** True if hand is over 21 */
export function isBust(hand: Card[]): boolean {
	return handValue(hand) > 21;
}

/** Dealer must hit on 16 or less, stand on 17+ */
export function dealerMustHit(hand: Card[]): boolean {
	return handValue(hand) < 17;
}

/**
 * Determine winner: player, dealer, or push.
 * Assumes both hands are final (no more hits).
 * Natural blackjack (A + 10/J/Q/K in two cards): dealer wins unless player also has blackjack (push).
 */
export function getWinner(playerHand: Card[], dealerHand: Card[]): 'player' | 'dealer' | 'push' {
	const pBlackjack = isBlackjack(playerHand);
	const dBlackjack = isBlackjack(dealerHand);

	// Dealer natural blackjack wins unless player also has natural blackjack (push)
	if (dBlackjack) return pBlackjack ? 'push' : 'dealer';
	if (pBlackjack) return 'player';

	const pv = handValue(playerHand);
	const dv = handValue(dealerHand);
	const pBust = pv > 21;
	const dBust = dv > 21;

	if (pBust) return 'dealer';
	if (dBust) return 'player';
	if (pv > dv) return 'player';
	if (dv > pv) return 'dealer';
	return 'push';
}
