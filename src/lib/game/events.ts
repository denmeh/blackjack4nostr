/**
 * Nostr publish/subscribe for blackjack game events.
 * Uses kinds 30400 (create), 30401 (join), 30402 (state).
 */

import { getNostrSdk } from '$lib/nostr';
import { getConnectedClient } from '$lib/game/relay-client';
import { DEFAULT_RELAYS } from '$lib/protocol/link';
import {
	KIND_GAME_CREATE,
	KIND_GAME_JOIN,
	KIND_GAME_STATE,
	KIND_GAME_ACTION,
	type GameCreatePayload,
	type GameJoinPayload,
	type GameStatePayload,
	type GameActionPayload
} from '$lib/protocol';

const LOG = true;
/** Shorter timeout for faster UX (was 10s) */
const CONNECT_TIMEOUT_SECS = 5;

function log(msg: string, ...args: unknown[]) {
	if (LOG) console.log('[b4n]', msg, ...args);
}

/** Tag name for game token (NIP-12 "t" style filter) */
const TAG_TOKEN = 't';

/** Normalize SDK/rust errors into a message we can show in UI */
function normalizeRelayError(e: unknown): string {
	const msg = e instanceof Error ? e.message : String(e);
	if (msg.includes('null pointer') || msg.includes('passed to rust')) {
		return 'Relay connection failed (network or relay issue). Try again or use another relay.';
	}
	return msg;
}

/**
 * Publish game create (30400). Caller is dealer.
 * Returns the created Event so you can get event.id for the game id.
 */
export async function publishGameCreate(
	payload: GameCreatePayload,
	relays: string[]
): Promise<{ eventId: string }> {
	log('publishGameCreate: start', { relaysCount: relays?.length, relays });
	const sdk = await getNostrSdk();
	const { EventBuilder, Kind, Tag } = sdk;
	const keys = await import('$lib/session').then((m) => m.getStoredKeys());
	if (!keys) {
		log('publishGameCreate: no keys (not logged in)');
		throw new Error('Not logged in');
	}
	log('publishGameCreate: got keys');

	const token = String(payload?.token ?? '').trim();
	if (!token) {
		log('publishGameCreate: invalid token');
		throw new Error('Invalid game token');
	}

	let urls = relays.filter((r): r is string => typeof r === 'string' && r.length > 0);
	if (urls.length === 0) {
		log('publishGameCreate: no valid relays, using DEFAULT_RELAYS', DEFAULT_RELAYS);
		urls = [...DEFAULT_RELAYS];
	}
	if (urls.length === 0) throw new Error('No relay URLs provided');
	log('publishGameCreate: using relay URLs', urls);

	const content = JSON.stringify(payload);
	const builder = new EventBuilder(new Kind(KIND_GAME_CREATE), content).tags([
		Tag.hashtag(token)
	]);

	try {
		log('publishGameCreate: using shared client');
		const client = await getConnectedClient(urls);
		const output = await client.sendEventBuilderTo(urls, builder);
		const eventId = output.id.toBech32();
		log('publishGameCreate: result', { eventId, success: output.success, failed: output.failed });
		if (!output.success || output.success.length === 0) {
			const failedMsg = output.failed?.length ? output.failed.map((f: { url: string; error: string }) => `${f.url}: ${f.error}`).join('; ') : 'unknown';
			throw new Error(`Could not publish to any relay. ${failedMsg}`);
		}
		return { eventId };
	} catch (e) {
		log('publishGameCreate: error', e);
		throw new Error(normalizeRelayError(e));
	}
}

/**
 * Publish game join (30401). Caller is player.
 */
export async function publishGameJoin(
	payload: GameJoinPayload,
	relays: string[],
	gameEventId: string,
	dealerPubkey: import('@rust-nostr/nostr-sdk').PublicKey
): Promise<void> {
	log('publishGameJoin: start', { gameEventId, relaysCount: relays?.length });
	const sdk = await getNostrSdk();
	const { EventBuilder, Kind, Tag, EventId } = sdk;
	const keys = await import('$lib/session').then((m) => m.getStoredKeys());
	if (!keys) throw new Error('Not logged in');

	let urls = relays.filter((r): r is string => typeof r === 'string' && r.length > 0);
	if (urls.length === 0) urls = [...DEFAULT_RELAYS];
	if (urls.length === 0) throw new Error('No relay URLs provided');
	log('publishGameJoin: relay URLs', urls);

	const content = JSON.stringify(payload);
	const eId = EventId.parse(gameEventId);
	const builder = new EventBuilder(new Kind(KIND_GAME_JOIN), content).tags([
		Tag.event(eId),
		Tag.publicKey(dealerPubkey)
	]);

	try {
		const client = await getConnectedClient(urls);
		const output = await client.sendEventBuilderTo(urls, builder);
		if (!output.success || output.success.length === 0) {
			const failedMsg = output.failed?.length ? output.failed.map((f: { url: string; error: string }) => f.error).join('; ') : 'unknown';
			throw new Error(`Could not send to any relay. ${failedMsg}`);
		}
		log('publishGameJoin: success');
	} catch (e) {
		log('publishGameJoin: error', e);
		throw new Error(normalizeRelayError(e));
	}
}

/**
 * Publish game state (30402). Caller must be dealer.
 */
export async function publishGameState(
	payload: GameStatePayload,
	relays: string[],
	gameEventId: string
): Promise<void> {
	log('publishGameState: start', { gameEventId, phase: payload.phase, relaysCount: relays?.length });
	const sdk = await getNostrSdk();
	const { EventBuilder, Kind, Tag, EventId } = sdk;
	const keys = await import('$lib/session').then((m) => m.getStoredKeys());
	if (!keys) throw new Error('Not logged in');

	let urls = relays.filter((r): r is string => typeof r === 'string' && r.length > 0);
	if (urls.length === 0) urls = [...DEFAULT_RELAYS];
	if (urls.length === 0) throw new Error('No relay URLs provided');
	log('publishGameState: relay URLs', urls);

	const content = JSON.stringify(payload);
	const eId = EventId.parse(gameEventId);
	const builder = new EventBuilder(new Kind(KIND_GAME_STATE), content).tags([Tag.event(eId)]);

	try {
		const client = await getConnectedClient(urls);
		const output = await client.sendEventBuilderTo(urls, builder);
		if (!output.success || output.success.length === 0) {
			const failedMsg = output.failed?.length ? output.failed.map((f: { url: string; error: string }) => f.error).join('; ') : 'unknown';
			throw new Error(`Could not send to any relay. ${failedMsg}`);
		}
		log('publishGameState: success');
	} catch (e) {
		log('publishGameState: error', e);
		throw new Error(normalizeRelayError(e));
	}
}

/**
 * Publish player action (30403). Caller is player.
 */
export async function publishGameAction(
	payload: GameActionPayload,
	relays: string[],
	gameEventId: string,
	dealerPubkey: import('@rust-nostr/nostr-sdk').PublicKey
): Promise<void> {
	log('publishGameAction: start', { gameEventId, action: payload.action, relaysCount: relays?.length });
	const sdk = await getNostrSdk();
	const { EventBuilder, Kind, Tag, EventId } = sdk;
	const keys = await import('$lib/session').then((m) => m.getStoredKeys());
	if (!keys) throw new Error('Not logged in');

	let urls = relays.filter((r): r is string => typeof r === 'string' && r.length > 0);
	if (urls.length === 0) urls = [...DEFAULT_RELAYS];
	if (urls.length === 0) throw new Error('No relay URLs provided');
	log('publishGameAction: relay URLs', urls);

	const content = JSON.stringify(payload);
	const eId = EventId.parse(gameEventId);
	const builder = new EventBuilder(new Kind(KIND_GAME_ACTION), content).tags([
		Tag.event(eId),
		Tag.publicKey(dealerPubkey)
	]);

	try {
		const client = await getConnectedClient(urls);
		const output = await client.sendEventBuilderTo(urls, builder);
		if (!output.success || output.success.length === 0) {
			const failedMsg = output.failed?.length ? output.failed.map((f: { url: string; error: string }) => f.error).join('; ') : 'unknown';
			throw new Error(`Could not send to any relay. ${failedMsg}`);
		}
		log('publishGameAction: success');
	} catch (e) {
		log('publishGameAction: error', e);
		throw new Error(normalizeRelayError(e));
	}
}

/** Subscribe to the game create event (one 30400 from dealer with token). Relays required. */
export async function subscribeGameCreate(
	dealerNpub: string,
	token: string,
	relays: string[],
	onEvent: (payload: GameCreatePayload, eventId: string) => void
): Promise<() => void> {
	log('subscribeGameCreate: start', { dealerNpub: dealerNpub?.slice(0, 12), token: token?.slice(0, 8), relaysCount: relays?.length });
	const sdk = await getNostrSdk();
	const { Client, Filter, Kind, PublicKey, NostrSigner } = sdk;
	const keys = await import('$lib/session').then((m) => m.getStoredKeys());
	if (!keys) throw new Error('Not logged in');

	const pubkey = PublicKey.parse(dealerNpub);
	const filter = new Filter().kind(new Kind(KIND_GAME_CREATE)).author(pubkey).hashtag(token);
	const signer = NostrSigner.keys(keys);
	const client = new Client(signer);
	for (const r of relays) await client.addRelay(r);
	await client.connect();
	log('subscribeGameCreate: connected, subscribing');

	const subId = 'b4n-create-' + token;
	await client.subscribeWithIdTo(relays, subId, filter, null);

	const handle: import('@rust-nostr/nostr-sdk').HandleNotification = {
		handleEvent: async (_relayUrl, subscriptionId, event) => {
			if (subscriptionId !== subId || event.kind.asU16() !== KIND_GAME_CREATE) return false;
			try {
				const payload = JSON.parse(event.content) as GameCreatePayload;
				if (payload.token !== token) return false;
				onEvent(payload, event.id.toBech32());
			} catch {
				// ignore
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

/** Fetch a single game create event (30400) by dealer and token. Uses shared client. */
export async function fetchGameCreate(
	dealerNpub: string,
	token: string,
	relays: string[],
	timeoutMs: number = 5000
): Promise<{ payload: GameCreatePayload; eventId: string } | null> {
	log('fetchGameCreate: start', { dealerNpub: dealerNpub?.slice(0, 12), token: token?.slice(0, 8), relaysCount: relays?.length });
	const sdk = await getNostrSdk();
	const { Filter, Kind, PublicKey, Duration } = sdk;
	const keys = await import('$lib/session').then((m) => m.getStoredKeys());
	if (!keys) throw new Error('Not logged in');

	const urls = relays.filter((r): r is string => typeof r === 'string' && r.length > 0);
	if (urls.length === 0) throw new Error('No relay URLs provided');
	const client = await getConnectedClient(urls);

	const pubkey = PublicKey.parse(dealerNpub);
	const filter = new Filter().kind(new Kind(KIND_GAME_CREATE)).author(pubkey).hashtag(token);
	log('fetchGameCreate: fetching events');
	const events = await client.fetchEvents(filter, Duration.fromSecs(Math.ceil(timeoutMs / 1000)));
	const event = events.first();
	log('fetchGameCreate: events count', events.len(), 'first', event ? 'ok' : 'null');
	if (!event) return null;
	const payload = JSON.parse(event.content) as GameCreatePayload;
	return { payload, eventId: event.id.toBech32() };
}

export type GameEventCallbacks = {
	onJoin?: (payload: GameJoinPayload, fromPubkey: string) => void;
	onState: (payload: GameStatePayload) => void;
	onAction?: (payload: GameActionPayload, fromPubkey: string) => void;
};

/** Subscribe to game events. Dealer: pass onJoin + onAction. Player: pass onState only. Uses shared client. */
export async function subscribeGameEvents(
	gameEventId: string,
	relays: string[],
	callbacks: GameEventCallbacks
): Promise<() => void> {
	log('subscribeGameEvents: start', { gameEventId: gameEventId.slice(0, 16), relaysCount: relays?.length });
	const sdk = await getNostrSdk();
	const { Filter, Kind, EventId } = sdk;

	const urls = relays.filter((r): r is string => typeof r === 'string' && r.length > 0);
	if (urls.length === 0) throw new Error('No relay URLs provided');
	const client = await getConnectedClient(urls.length ? urls : [...DEFAULT_RELAYS]);
	log('subscribeGameEvents: using shared client, subscribing');
	const eId = EventId.parse(gameEventId);

	const subIdState = 'b4n-state-' + gameEventId.slice(0, 12);
	const subIdJoin = 'b4n-join-' + gameEventId.slice(0, 12);
	const subIdAction = 'b4n-action-' + gameEventId.slice(0, 12);
	const subIds: string[] = [subIdState];

	const filterState = new Filter().kind(new Kind(KIND_GAME_STATE)).event(eId);
	await client.subscribeWithIdTo(urls, subIdState, filterState, null);

	if (callbacks.onJoin) {
		subIds.push(subIdJoin);
		const filterJoin = new Filter().kind(new Kind(KIND_GAME_JOIN)).event(eId);
		await client.subscribeWithIdTo(urls, subIdJoin, filterJoin, null);
	}
	if (callbacks.onAction) {
		subIds.push(subIdAction);
		const filterAction = new Filter().kind(new Kind(KIND_GAME_ACTION)).event(eId);
		await client.subscribeWithIdTo(urls, subIdAction, filterAction, null);
	}

	const handle: import('@rust-nostr/nostr-sdk').HandleNotification = {
		handleEvent: async (_relayUrl, subscriptionId, event) => {
			try {
				if (subscriptionId === subIdJoin && event.kind.asU16() === KIND_GAME_JOIN && callbacks.onJoin) {
					const payload = JSON.parse(event.content) as GameJoinPayload;
					callbacks.onJoin(payload, event.author.toBech32());
				} else if (subscriptionId === subIdState && event.kind.asU16() === KIND_GAME_STATE) {
					const payload = JSON.parse(event.content) as GameStatePayload;
					log('subscribeGameEvents: state received', { phase: payload.phase, winner: payload.winner });
					callbacks.onState(payload);
				} else if (subscriptionId === subIdAction && event.kind.asU16() === KIND_GAME_ACTION && callbacks.onAction) {
					const payload = JSON.parse(event.content) as GameActionPayload;
					callbacks.onAction(payload, event.author.toBech32());
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
