/**
 * Game link format: blackjack4nostr://<npub>?relays=...&token=...
 * Also supports https URL for web: /join?npub=...&relays=...&token=...
 */

import type { GameLinkParams } from './types';
import { PROTOCOL_SCHEME } from './types';

// Default relays for hosting/joining. Must allow custom kinds 30400–30404 (some relays block them).
export const DEFAULT_RELAYS = ['wss://relay.getportal.cc', 'wss://relay.damus.io'];

/** Build deep link for sharing (relays as comma-separated in one param or multiple relay params) */
export function buildGameLink(params: GameLinkParams): string {
	const u = new URL(`${PROTOCOL_SCHEME}://${params.npub}`);
	u.searchParams.set('token', params.token);
	// Single param with comma-separated relays
	u.searchParams.set('relays', params.relays.join(','));
	return u.toString();
}

/**
 * Parse game link. Accepts:
 * - blackjack4nostr://npub1xxx?relays=wss://a,wss://b&token=abc
 * - https://domain/join?npub=...&relays=...&token=...
 */
export function parseGameLink(link: string): GameLinkParams | null {
	const trimmed = link.trim();
	if (!trimmed.startsWith(PROTOCOL_SCHEME + '://') && !trimmed.startsWith('http')) {
		return null;
	}
	let url: URL;
	try {
		url = trimmed.startsWith(PROTOCOL_SCHEME + '://')
			? new URL(trimmed.replace(PROTOCOL_SCHEME + '://', 'https://'))
			: new URL(trimmed);
	} catch {
		return null;
	}

	const npub = trimmed.startsWith(PROTOCOL_SCHEME + '://') ? url.host : url.searchParams.get('npub');
	const token = url.searchParams.get('token');
	const relaysParam = url.searchParams.get('relays');
	if (!npub || !token) return null;

	const relays = relaysParam ? relaysParam.split(',').map((r) => r.trim()).filter(Boolean) : [];
	if (relays.length === 0) return null;

	return { npub, token, relays };
}

/**
 * Build web join URL for current origin (so user can open in browser).
 */
export function buildJoinWebUrl(params: GameLinkParams, baseUrl?: string): string {
	const base = typeof window !== 'undefined' ? window.location.origin : baseUrl ?? '';
	const u = new URL('/join', base);
	u.searchParams.set('npub', params.npub);
	u.searchParams.set('token', params.token);
	u.searchParams.set('relays', params.relays.join(','));
	return u.toString();
}
