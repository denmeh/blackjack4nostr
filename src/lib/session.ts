import { writable, get } from 'svelte/store';
import { getNostrSdk } from '$lib/nostr';
import type { Keys, NWC, NostrWalletConnectURI } from '@rust-nostr/nostr-sdk';

const STORAGE_NSEC = 'b4n_nsec';
const STORAGE_NPUB = 'b4n_npub';
const STORAGE_NWC = 'b4n_nwc';

/** True when we have both nostr identity and NWC URL in localStorage. */
export const isLoggedIn = writable(false);

/** Npub (bech32) when logged in. */
export const npub = writable<string | null>(null);

/** NWC balance in satoshis, or null if not fetched / no NWC. */
export const nwcBalance = writable<bigint | null>(null);

/** NWC balance loading/error state. */
export const nwcBalanceError = writable<string | null>(null);

function readStorage(): { nsec: string | null; npubStored: string | null; nwc: string | null } {
	if (typeof localStorage === 'undefined') {
		return { nsec: null, npubStored: null, nwc: null };
	}
	return {
		nsec: localStorage.getItem(STORAGE_NSEC),
		npubStored: localStorage.getItem(STORAGE_NPUB),
		nwc: localStorage.getItem(STORAGE_NWC)
	};
}

/**
 * Call on app init (client). Updates isLoggedIn and npub from localStorage.
 */
export function loadSession(): void {
	const { nsec, npubStored, nwc } = readStorage();
	const hasIdentity = Boolean(nsec && npubStored);
	const hasNwc = Boolean(nwc);
	isLoggedIn.set(hasIdentity && hasNwc);
	npub.set(npubStored);
}

/**
 * Whether setup is complete (we have identity + NWC in storage).
 */
export function hasSession(): boolean {
	const { nsec, npubStored, nwc } = readStorage();
	return Boolean(nsec && npubStored && nwc);
}

/**
 * Save nostr identity (nsec + npub). Call after generate or import.
 */
export function saveIdentity(nsecHexOrBech32: string, npubBech32: string): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_NSEC, nsecHexOrBech32);
	localStorage.setItem(STORAGE_NPUB, npubBech32);
	npub.set(npubBech32);
	loadSession();
}

/**
 * Save NWC URI and refresh session.
 */
export function saveNwc(uri: string): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_NWC, uri);
	loadSession();
}

/**
 * Clear all session data from localStorage and stores.
 */
export function clearSession(): void {
	if (typeof localStorage !== 'undefined') {
		localStorage.removeItem(STORAGE_NSEC);
		localStorage.removeItem(STORAGE_NPUB);
		localStorage.removeItem(STORAGE_NWC);
	}
	isLoggedIn.set(false);
	npub.set(null);
	nwcBalance.set(null);
	nwcBalanceError.set(null);
}

/**
 * Get Nostr Keys from stored nsec. Requires WASM init.
 */
export async function getStoredKeys(): Promise<Keys | null> {
	const { nsec } = readStorage();
	if (!nsec) return null;
	const { Keys } = await getNostrSdk();
	return Keys.parse(nsec);
}

/**
 * Get NWC client from stored URI. Returns null if no URI or parse error.
 */
export async function getNwcClient(): Promise<NWC | null> {
	const { nwc } = readStorage();
	if (!nwc) return null;
	try {
		const sdk = await getNostrSdk();
		const uri: NostrWalletConnectURI = sdk.NostrWalletConnectURI.parse(nwc);
		return new sdk.NWC(uri);
	} catch {
		return null;
	}
}

/**
 * Fetch NWC balance and update nwcBalance store. Call when logged in.
 */
export async function fetchNwcBalance(): Promise<void> {
	nwcBalanceError.set(null);
	const client = await getNwcClient();
	if (!client) {
		nwcBalanceError.set('No NWC configured');
		return;
	}
	try {
		const balance = await client.getBalance();
		nwcBalance.set(balance);
	} catch (e) {
		nwcBalanceError.set(e instanceof Error ? e.message : String(e));
		nwcBalance.set(null);
	}
}
