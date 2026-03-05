/**
 * Nostr publish/subscribe for blackjack game events.
 * Uses kinds 30400 (create), 30401 (join), 30402 (state), 30403 (action), 30404 (play again).
 */

import { getNostrSdk } from '$lib/nostr';
import { getConnectedClient } from '$lib/game/relay-client';
import { DEFAULT_RELAYS } from '$lib/protocol/link';
import {
	KIND_GAME_CREATE,
	KIND_GAME_JOIN,
	KIND_GAME_STATE,
	KIND_GAME_ACTION,
	KIND_GAME_PLAY_AGAIN,
	type GameCreatePayload,
	type GameJoinPayload,
	type GameStatePayload,
	type GameActionPayload,
	type GamePlayAgainPayload
} from '$lib/protocol';

const LOG = true;

function log(msg: string, ...args: unknown[]) {
	if (LOG) console.log('[b4n]', msg, ...args);
}

const RELAY_BLOCK_HINT =
	' Ask the host to create a new game and share a link that uses relays allowing game events.';

function normalizeRelayError(e: unknown): string {
	const msg = e instanceof Error ? e.message : String(e);
	if (msg.includes('null pointer') || msg.includes('passed to rust')) {
		return 'Relay connection failed (network or relay issue). Try again or use another relay.';
	}
	if (msg.includes('not allowed') || msg.includes('rate-limited') || msg.includes('blocked')) {
		return msg + RELAY_BLOCK_HINT;
	}
	return msg;
}

function ensureRelayUrls(relays: string[], fallbackToDefault = true): string[] {
	const urls = relays.filter((r): r is string => typeof r === 'string' && r.length > 0);
	if (urls.length > 0) return urls;
	if (fallbackToDefault && DEFAULT_RELAYS.length > 0) return [...DEFAULT_RELAYS];
	throw new Error('No relay URLs provided');
}

async function requireKeys(): Promise<import('@rust-nostr/nostr-sdk').Keys> {
	const keys = await import('$lib/session').then((m) => m.getStoredKeys());
	if (!keys) throw new Error('Not logged in');
	return keys;
}

type SendOutput = { id: { toBech32: () => string }; success: unknown[]; failed?: Array<{ url: string; error: string }> };

async function sendEventAndThrowOnFailure(
	urls: string[],
	builder: import('@rust-nostr/nostr-sdk').EventBuilder,
	options: { includeUrlInError?: boolean } = {}
): Promise<{ eventId: string }> {
	const client = await getConnectedClient(urls);
	const output = (await client.sendEventBuilderTo(urls, builder)) as SendOutput;
	const eventId = output.id.toBech32();
	if (output.success && output.success.length > 0) {
		return { eventId };
	}
	const failedMsg = output.failed?.length
		? output.failed.map((f) => (options.includeUrlInError ? `${f.url}: ${f.error}` : f.error)).join('; ')
		: 'unknown';
	throw new Error(`Could not publish to any relay. ${failedMsg}`);
}

function normalizeGameJoinPayload(raw: Record<string, unknown>): GameJoinPayload {
	return {
		gameEventId: (typeof raw?.gameEventId === 'string' ? raw.gameEventId : (raw?.game_event_id as string)) ?? '',
		dealerNpub: (typeof raw?.dealerNpub === 'string' ? raw.dealerNpub : (raw?.dealer_npub as string)) ?? '',
		playerSeed: (typeof raw?.playerSeed === 'string' ? raw.playerSeed : (raw?.player_seed as string)) ?? '',
		createdAt: (typeof raw?.createdAt === 'number' ? raw.createdAt : (raw?.created_at as number)) ?? 0
	};
}

function normalizeGamePlayAgainPayload(raw: Record<string, unknown>): GamePlayAgainPayload {
	return {
		gameEventId: (typeof raw?.gameEventId === 'string' ? raw.gameEventId : (raw?.game_event_id as string)) ?? '',
		playerSeed: (typeof raw?.playerSeed === 'string' ? raw.playerSeed : (raw?.player_seed as string)) ?? '',
		createdAt: (typeof raw?.createdAt === 'number' ? raw.createdAt : (raw?.created_at as number)) ?? 0
	};
}

/** Publish game create (30400). Caller is dealer. Returns event id for the game. */
export async function publishGameCreate(
	payload: GameCreatePayload,
	relays: string[]
): Promise<{ eventId: string }> {
	log('publishGameCreate: start', { relaysCount: relays?.length, relays });
	await requireKeys();
	const token = String(payload?.token ?? '').trim();
	if (!token) throw new Error('Invalid game token');

	const urls = ensureRelayUrls(relays ?? []);
	log('publishGameCreate: using relay URLs', urls);

	const sdk = await getNostrSdk();
	const { EventBuilder, Kind, Tag } = sdk;
	const builder = new EventBuilder(new Kind(KIND_GAME_CREATE), JSON.stringify(payload)).tags([
		Tag.hashtag(token)
	]);

	try {
		const result = await sendEventAndThrowOnFailure(urls, builder, { includeUrlInError: true });
		log('publishGameCreate: result', result.eventId);
		return result;
	} catch (e) {
		log('publishGameCreate: error', e);
		throw new Error(normalizeRelayError(e));
	}
}

/** Publish game join (30401). Caller is player. */
export async function publishGameJoin(
	payload: GameJoinPayload,
	relays: string[],
	gameEventId: string,
	dealerPubkey: import('@rust-nostr/nostr-sdk').PublicKey
): Promise<void> {
	log('publishGameJoin: start', { gameEventId, relaysCount: relays?.length });
	await requireKeys();
	const urls = ensureRelayUrls(relays ?? []);

	const sdk = await getNostrSdk();
	const { EventBuilder, Kind, Tag, EventId } = sdk;
	const builder = new EventBuilder(new Kind(KIND_GAME_JOIN), JSON.stringify(payload)).tags([
		Tag.event(EventId.parse(gameEventId)),
		Tag.publicKey(dealerPubkey)
	]);

	try {
		await sendEventAndThrowOnFailure(urls, builder);
		log('publishGameJoin: success');
	} catch (e) {
		log('publishGameJoin: error', e);
		throw new Error(normalizeRelayError(e));
	}
}

/** Publish game state (30402). Caller must be dealer. */
export async function publishGameState(
	payload: GameStatePayload,
	relays: string[],
	gameEventId: string
): Promise<void> {
	log('publishGameState: start', { gameEventId, phase: payload.phase, relaysCount: relays?.length });
	await requireKeys();
	const urls = ensureRelayUrls(relays ?? []);

	const sdk = await getNostrSdk();
	const { EventBuilder, Kind, Tag, EventId } = sdk;
	const builder = new EventBuilder(new Kind(KIND_GAME_STATE), JSON.stringify(payload)).tags([
		Tag.event(EventId.parse(gameEventId))
	]);

	try {
		await sendEventAndThrowOnFailure(urls, builder);
		log('publishGameState: success');
	} catch (e) {
		log('publishGameState: error', e);
		throw new Error(normalizeRelayError(e));
	}
}

/** Publish player action (30403). Caller is player. */
export async function publishGameAction(
	payload: GameActionPayload,
	relays: string[],
	gameEventId: string,
	dealerPubkey: import('@rust-nostr/nostr-sdk').PublicKey
): Promise<void> {
	log('publishGameAction: start', { gameEventId, action: payload.action, relaysCount: relays?.length });
	await requireKeys();
	const urls = ensureRelayUrls(relays ?? []);

	const sdk = await getNostrSdk();
	const { EventBuilder, Kind, Tag, EventId } = sdk;
	const builder = new EventBuilder(new Kind(KIND_GAME_ACTION), JSON.stringify(payload)).tags([
		Tag.event(EventId.parse(gameEventId)),
		Tag.publicKey(dealerPubkey)
	]);

	try {
		await sendEventAndThrowOnFailure(urls, builder);
		log('publishGameAction: success');
	} catch (e) {
		log('publishGameAction: error', e);
		throw new Error(normalizeRelayError(e));
	}
}

/** Publish play-again request (30404). Caller is player. */
export async function publishPlayAgain(
	payload: GamePlayAgainPayload,
	relays: string[],
	gameEventId: string,
	dealerPubkey: import('@rust-nostr/nostr-sdk').PublicKey
): Promise<void> {
	log('publishPlayAgain: start', { gameEventId: gameEventId.slice(0, 16), relaysCount: relays?.length });
	await requireKeys();
	const urls = ensureRelayUrls(relays ?? [], false);

	const sdk = await getNostrSdk();
	const { EventBuilder, Kind, Tag, EventId } = sdk;
	const builder = new EventBuilder(new Kind(KIND_GAME_PLAY_AGAIN), JSON.stringify(payload)).tags([
		Tag.event(EventId.parse(gameEventId)),
		Tag.publicKey(dealerPubkey)
	]);

	try {
		await sendEventAndThrowOnFailure(urls, builder);
		log('publishPlayAgain: success');
	} catch (e) {
		log('publishPlayAgain: error', e);
		throw new Error(normalizeRelayError(e));
	}
}

/** Subscribe to game create event (30400) from dealer with token. */
export async function subscribeGameCreate(
	dealerNpub: string,
	token: string,
	relays: string[],
	onEvent: (payload: GameCreatePayload, eventId: string) => void
): Promise<() => void> {
	log('subscribeGameCreate: start', { dealerNpub: dealerNpub?.slice(0, 12), token: token?.slice(0, 8), relaysCount: relays?.length });
	const keys = await requireKeys();
	const urls = ensureRelayUrls(relays ?? [], false);

	const sdk = await getNostrSdk();
	const { Client, Filter, Kind, PublicKey, NostrSigner } = sdk;
	const client = new Client(NostrSigner.keys(keys));
	for (const r of relays) await client.addRelay(r);
	await client.connect();
	log('subscribeGameCreate: connected, subscribing');

	const subId = 'b4n-create-' + token;
	await client.subscribeWithIdTo(relays, subId, new Filter().kind(new Kind(KIND_GAME_CREATE)).author(PublicKey.parse(dealerNpub)).hashtag(token), null);

	const handle: import('@rust-nostr/nostr-sdk').HandleNotification = {
		handleEvent: async (_relayUrl, subscriptionId, event) => {
			if (subscriptionId !== subId || event.kind.asU16() !== KIND_GAME_CREATE) return false;
			try {
				const payload = JSON.parse(event.content) as GameCreatePayload;
				if (payload.token !== token) return false;
				onEvent(payload, event.id.toBech32());
			} catch {
				// ignore parse errors
			}
			return false;
		},
		handleMsg: async () => false
	};
	const abortHandle = client.handleNotifications(handle);

	return () => {
		abortHandle.abort();
		client.unsubscribe(subId);
	};
}

/** Fetch a single game create event (30400) by dealer and token. */
export async function fetchGameCreate(
	dealerNpub: string,
	token: string,
	relays: string[],
	timeoutMs = 5000
): Promise<{ payload: GameCreatePayload; eventId: string } | null> {
	log('fetchGameCreate: start', { dealerNpub: dealerNpub?.slice(0, 12), token: token?.slice(0, 8), relaysCount: relays?.length });
	await requireKeys();
	const urls = ensureRelayUrls(relays ?? [], false);
	const client = await getConnectedClient(urls);

	const sdk = await getNostrSdk();
	const { Filter, Kind, PublicKey, Duration } = sdk;
	const filter = new Filter().kind(new Kind(KIND_GAME_CREATE)).author(PublicKey.parse(dealerNpub)).hashtag(token);
	const events = await client.fetchEvents(filter, Duration.fromSecs(Math.ceil(timeoutMs / 1000)));
	const event = events.first();
	if (!event) return null;
	const payload = JSON.parse(event.content) as GameCreatePayload;
	return { payload, eventId: event.id.toBech32() };
}

export type GameEventCallbacks = {
	onJoin?: (payload: GameJoinPayload, fromPubkey: string) => void;
	onState: (payload: GameStatePayload) => void;
	onAction?: (payload: GameActionPayload, fromPubkey: string) => void;
	onPlayAgain?: (payload: GamePlayAgainPayload, fromPubkey: string) => void;
};

/** Subscribe to game events. Dealer: onJoin + onAction. Player: onState only. */
export async function subscribeGameEvents(
	gameEventId: string,
	relays: string[],
	callbacks: GameEventCallbacks
): Promise<() => void> {
	log('subscribeGameEvents: start', { gameEventId: gameEventId.slice(0, 16), relaysCount: relays?.length });
	const urls = ensureRelayUrls(relays ?? [], true);
	const client = await getConnectedClient(urls);
	const sdk = await getNostrSdk();
	const eId = sdk.EventId.parse(gameEventId);

	const subIdState = 'b4n-state-' + gameEventId.slice(0, 12);
	const subIdJoin = 'b4n-join-' + gameEventId.slice(0, 12);
	const subIdAction = 'b4n-action-' + gameEventId.slice(0, 12);
	const subIdPlayAgain = 'b4n-playagain-' + gameEventId.slice(0, 12);
	const subIds: string[] = [subIdState];
	const { Filter, Kind } = sdk;

	await client.subscribeWithIdTo(urls, subIdState, new Filter().kind(new Kind(KIND_GAME_STATE)).event(eId), null);

	if (callbacks.onJoin) {
		subIds.push(subIdJoin);
		await client.subscribeWithIdTo(urls, subIdJoin, new Filter().kind(new Kind(KIND_GAME_JOIN)).event(eId), null);
	}
	if (callbacks.onAction) {
		subIds.push(subIdAction);
		await client.subscribeWithIdTo(urls, subIdAction, new Filter().kind(new Kind(KIND_GAME_ACTION)).event(eId), null);
	}
	if (callbacks.onPlayAgain) {
		subIds.push(subIdPlayAgain);
		await client.subscribeWithIdTo(urls, subIdPlayAgain, new Filter().kind(new Kind(KIND_GAME_PLAY_AGAIN)).event(eId), null);
	}

	const handle: import('@rust-nostr/nostr-sdk').HandleNotification = {
		handleEvent: async (_relayUrl, subscriptionId, event) => {
			try {
				if (subscriptionId === subIdJoin && event.kind.asU16() === KIND_GAME_JOIN && callbacks.onJoin) {
					callbacks.onJoin(normalizeGameJoinPayload(JSON.parse(event.content) as Record<string, unknown>), event.author.toBech32());
					return false;
				}
				if (subscriptionId === subIdState && event.kind.asU16() === KIND_GAME_STATE) {
					const payload = JSON.parse(event.content) as GameStatePayload;
					log('subscribeGameEvents: state received', { phase: payload.phase, winner: payload.winner });
					callbacks.onState(payload);
					return false;
				}
				if (subscriptionId === subIdAction && event.kind.asU16() === KIND_GAME_ACTION && callbacks.onAction) {
					callbacks.onAction(JSON.parse(event.content) as GameActionPayload, event.author.toBech32());
					return false;
				}
				if (subscriptionId === subIdPlayAgain && event.kind.asU16() === KIND_GAME_PLAY_AGAIN && callbacks.onPlayAgain) {
					callbacks.onPlayAgain(normalizeGamePlayAgainPayload(JSON.parse(event.content) as Record<string, unknown>), event.author.toBech32());
					return false;
				}
			} catch (e) {
				log('subscribeGameEvents: handleEvent error', e);
			}
			return false;
		},
		handleMsg: async () => false
	};
	const abortHandle = client.handleNotifications(handle);

	return () => {
		abortHandle.abort();
		for (const id of subIds) client.unsubscribe(id);
	};
}
