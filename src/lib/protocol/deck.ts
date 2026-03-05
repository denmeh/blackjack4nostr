/**
 * Provably fair deck: deterministic 52 cards from seed (dealerSeed + playerSeed).
 * Uses SHA-256 for commitment and for deterministic shuffle.
 */

import type { Card } from './types';

const SUITS = ['s', 'h', 'd', 'c']; // spades, hearts, diamonds, clubs
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/** All 52 cards in fixed order before shuffle: "2s", "2h", ... "Ac" */
export const FULL_DECK_ORDER: Card[] = SUITS.flatMap((s) => RANKS.map((r) => r + s));

/** SHA-256 hash of input string (hex-encoded UTF-8), returns hex string */
export async function sha256Hex(input: string): Promise<string> {
	const enc = new TextEncoder();
	const data = enc.encode(input);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** Synchronous SHA-256 using Web Crypto (same as above, for use in workers or where await is ok). */
export function sha256HexSyncNotAvailable(): never {
	throw new Error('Use async sha256Hex() for SHA-256');
}

/** Get 32 bytes from SHA256(seed + counter) for deterministic RNG */
async function hashStep(seedHex: string, counter: number): Promise<Uint8Array> {
	const msg = seedHex + '.' + counter;
	const enc = new TextEncoder();
	const hash = await crypto.subtle.digest('SHA-256', enc.encode(msg));
	return new Uint8Array(hash);
}

/** Read uint32 from bytes (big-endian) at offset */
function readUint32(bytes: Uint8Array, offset: number): number {
	return (bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
}

/** Deterministic shuffle of array using seed. Returns new array. */
async function shuffledIndexes(seed: string, length: number): Promise<number[]> {
	const indexes = Array.from({ length }, (_, i) => i);
	let counter = 0;
	for (let i = length - 1; i > 0; i--) {
		const bytes = await hashStep(seed, counter++);
		// uint32 in [0, i+1)
		const r = readUint32(bytes, 0) % (i + 1);
		[indexes[i], indexes[r]] = [indexes[r]!, indexes[i]!];
	}
	return indexes;
}

/**
 * Build the game deck from combined seed (dealer + player).
 * Seed = dealerSeed + playerSeed (concatenated strings).
 * Returns 52 cards in play order.
 */
export async function deckFromSeed(dealerSeed: string, playerSeed: string): Promise<Card[]> {
	const combined = dealerSeed + playerSeed;
	const indexes = await shuffledIndexes(combined, 52);
	return indexes.map((i) => FULL_DECK_ORDER[i]!);
}

/**
 * Verify dealer's commitment: SHA256(dealerSeed) must equal dealerSeedHash.
 */
export async function verifyDealerSeed(dealerSeed: string, dealerSeedHash: string): Promise<boolean> {
	const hash = await sha256Hex(dealerSeed);
	return hash.toLowerCase() === dealerSeedHash.toLowerCase();
}
