import { writable } from 'svelte/store';

export type NostrSdk = typeof import('@rust-nostr/nostr-sdk');

let initPromise: Promise<void> | null = null;

/** True when WASM has been loaded and the Nostr SDK is ready to use. */
export const isNostrReady = writable(false);

/**
 * Load the Nostr SDK WASM once. Safe to call multiple times; only runs once.
 * Call this from the root layout onMount so the SDK is ready app-wide.
 */
export async function initNostr(): Promise<void> {
	if (initPromise) return initPromise;
	initPromise = (async () => {
		const sdk = await import('@rust-nostr/nostr-sdk');
		await sdk.loadWasmAsync();
		isNostrReady.set(true);
	})();
	return initPromise;
}

/**
 * Get the Nostr SDK. Waits for initNostr() to finish if it's still in progress.
 * Use this in pages/components that need Keys, Client, EventBuilder, etc.
 */
export async function getNostrSdk(): Promise<NostrSdk> {
	await initNostr();
	return import('@rust-nostr/nostr-sdk');
}
