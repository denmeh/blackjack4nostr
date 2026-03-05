/**
 * Single shared Nostr client per relay set. Connect once, reuse for all publish/subscribe.
 * Avoids reconnecting to relays on every command.
 */

import { getNostrSdk } from '$lib/nostr';

const CONNECT_TIMEOUT_SECS = 5;

let cachedClient: import('@rust-nostr/nostr-sdk').Client | null = null;
let cachedRelaysKey = '';

function relayKey(urls: string[]): string {
	return [...urls].filter(Boolean).sort().join(',');
}

/**
 * Returns a Client already connected to the given relays. Reuses the same client
 * when the relay list is unchanged so we don't reconnect on every command.
 */
export async function getConnectedClient(
	relays: string[]
): Promise<import('@rust-nostr/nostr-sdk').Client> {
	const urls = relays.filter((r): r is string => typeof r === 'string' && r.length > 0);
	if (urls.length === 0) throw new Error('No relay URLs provided');

	const key = relayKey(urls);
	if (cachedClient && cachedRelaysKey === key) {
		return cachedClient;
	}

	// New or different relays: create client and connect
	const sdk = await getNostrSdk();
	const { Client, NostrSigner, Duration } = sdk;
	const keys = await import('$lib/session').then((m) => m.getStoredKeys());
	if (!keys) throw new Error('Not logged in');

	if (cachedClient) {
		try {
			await cachedClient.disconnect();
		} catch {
			// ignore
		}
		cachedClient = null;
		cachedRelaysKey = '';
	}

	const signer = NostrSigner.keys(keys);
	const client = new Client(signer);
	for (const r of urls) await client.addRelay(r);
	await client.connect();
	await client.waitForConnection(Duration.fromSecs(CONNECT_TIMEOUT_SECS));

	cachedClient = client;
	cachedRelaysKey = key;
	return client;
}

/** Clear cached client (e.g. on logout or when relays should be refreshed). */
export function clearConnectedClient(): void {
	cachedClient = null;
	cachedRelaysKey = '';
}
