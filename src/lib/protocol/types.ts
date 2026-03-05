/**
 * Blackjack4Nostr protocol types and constants.
 * Provably fair: deck = shuffle(seed), seed = dealerSeed + playerSeed.
 * Dealer commits with SHA256(dealerSeed); reveals at game end.
 */

/** Nostr event kinds for the game protocol */
export const KIND_GAME_CREATE = 30400;
export const KIND_GAME_JOIN = 30401;
export const KIND_GAME_STATE = 30402;
export const KIND_GAME_ACTION = 30403;

/** Single card: "2"-"10", "J", "Q", "K", "A" (value 2-10, face=10, ace=1 or 11) */
export type Card = string;

/** Phase of the game */
export type GamePhase =
	| 'waiting_join'   // dealer created, waiting for player join (player seed)
	| 'playing'        // player's turn (hit/stand)
	| 'dealer_turn'    // dealer drawing
	| 'finished';     // result + dealer seed revealed

/** Payload of kind 30400: game create (dealer) */
export interface GameCreatePayload {
	/** Unique game token (e.g. random hex) */
	token: string;
	/** Relay URLs to use for this game */
	relays: string[];
	/** SHA256(dealerSeed) hex — commitment; dealer reveals dealerSeed at game end */
	dealerSeedHash: string;
	createdAt: number;
}

/** Payload of kind 30401: player join */
export interface GameJoinPayload {
	/** Event id of the game create (30400) */
	gameEventId: string;
	/** Dealer npub (for routing) */
	dealerNpub: string;
	/** Player's random seed (hex string); combined with dealer seed to form deck seed */
	playerSeed: string;
	createdAt: number;
}

/** Payload of kind 30403: player action (hit or stand) */
export interface GameActionPayload {
	gameEventId: string;
	action: 'hit' | 'stand';
	createdAt: number;
}

/** Payload of kind 30402: game state update (dealer only) */
export interface GameStatePayload {
	gameEventId: string;
	phase: GamePhase;
	/** Index into the shared deck (how many cards have been dealt) */
	deckIndex: number;
	/** Player hand (card codes) */
	playerHand: Card[];
	/** Dealer hand (card codes); hide hole card until dealer_turn/finished */
	dealerHand: Card[];
	/** Only set when phase === 'finished' */
	winner?: 'player' | 'dealer' | 'push';
	/** Only set when phase === 'finished' — provably fair reveal */
	dealerSeedReveal?: string;
	createdAt: number;
}

/** Deep link format: blackjack4nostr://<npub>?relays=...&token=... */
export interface GameLinkParams {
	npub: string;
	relays: string[];
	token: string;
}

export const PROTOCOL_SCHEME = 'blackjack4nostr';
