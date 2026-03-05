/** Generate a cryptographically random hex string (e.g. for game seeds). */
export function generateRandomHexSeed(byteLength = 32): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(byteLength)))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
