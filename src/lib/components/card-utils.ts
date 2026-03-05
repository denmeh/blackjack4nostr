/**
 * Map protocol card code (e.g. "Kh", "10s", "Ac") to Unicode playing card character.
 * Suits: s=spades, h=hearts, d=diamonds, c=clubs.
 * Ranks: 2-10, J, Q, K, A (A=1, J=11, Q=12, K=13 for Unicode).
 */
const RANK_TO_NUM: Record<string, number> = {
	A: 1,
	'2': 2,
	'3': 3,
	'4': 4,
	'5': 5,
	'6': 6,
	'7': 7,
	'8': 8,
	'9': 9,
	'10': 10,
	J: 11,
	Q: 12,
	K: 13
};
const SUIT_TO_NUM: Record<string, number> = { s: 0, h: 1, d: 2, c: 3 };

/** Unicode code point for playing card back */
export const CARD_BACK_CODEPOINT = 0x1f0a0;

/** Get Unicode code point for a card. Card format: rank + suit, e.g. "Kh", "10s", "Ac". */
export function cardToCodepoint(card: string): number {
	const rankChar = card.length === 3 ? card.slice(0, 2) : card[0]!; // "10" or single letter
	const suitChar = card.slice(-1)!;
	const rank = RANK_TO_NUM[rankChar] ?? 0;
	const suit = SUIT_TO_NUM[suitChar] ?? 0;
	if (rank < 1 || rank > 13 || suit < 0 || suit > 3) return CARD_BACK_CODEPOINT;
	// U+1F0A0 = back; next 13 = spades A–K, then hearts, diamonds, clubs (16 per suit)
	return 0x1f0a0 + 16 * suit + rank;
}

/** Get the Unicode character for a card (or card back). */
export function cardToChar(card: string | 'back'): string {
	if (card === 'back') return String.fromCodePoint(CARD_BACK_CODEPOINT);
	return String.fromCodePoint(cardToCodepoint(card));
}

const SUIT_SYMBOLS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

/** Human-readable label for a card (e.g. "K♥", "10♠"). Always visible when Unicode cards are not. */
export function cardToLabel(card: string | 'back'): string {
	if (card === 'back') return '?';
	const rank = card.length === 3 ? card.slice(0, 2) : card[0] ?? '?';
	const suitChar = card.slice(-1) ?? '';
	return rank + (SUIT_SYMBOLS[suitChar] ?? suitChar);
}

/** True for hearts and diamonds (red suits). */
export function isRedSuit(card: string): boolean {
	const s = card.slice(-1);
	return s === 'h' || s === 'd';
}
