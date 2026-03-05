<script lang="ts">
	import { cardToChar, cardToLabel, isRedSuit } from './card-utils';

	let { card, faceDown = false }: { card: string; faceDown?: boolean } = $props();
	const char = $derived(faceDown ? cardToChar('back') : cardToChar(card));
	const label = $derived(faceDown ? '?' : cardToLabel(card));
	const red = $derived(!faceDown && isRedSuit(card));
</script>

<div class="card" class:face-down={faceDown} class:red-suit={red} title={faceDown ? 'Hidden' : card}>
	<span class="symbol" aria-hidden="true">{char}</span>
	<span class="label">{label}</span>
</div>

<style>
	.card {
		--card-w: 3.5rem;
		--card-h: 4.8rem;
		width: var(--card-w);
		height: var(--card-h);
		min-width: var(--card-w);
		min-height: var(--card-h);
		background: linear-gradient(152deg, #faf8f5 0%, #f0ebe3 50%, #e8e2d9 100%);
		border-radius: 8px;
		box-shadow:
			0 1px 2px rgba(0, 0, 0, 0.15),
			0 4px 12px rgba(0, 0, 0, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.8);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(0, 0, 0, 0.08);
		position: relative;
		gap: 0.15rem;
	}
	.card.face-down {
		background: linear-gradient(152deg, #1a2520 0%, #121a16 50%, #0f1613 100%);
		border-color: rgba(212, 168, 83, 0.25);
		box-shadow:
			0 1px 2px rgba(0, 0, 0, 0.3),
			0 4px 12px rgba(0, 0, 0, 0.25),
			inset 0 1px 0 rgba(255, 255, 255, 0.06);
	}
	.symbol {
		font-size: 1.5rem;
		line-height: 1;
		user-select: none;
	}
	.label {
		font-size: 0.95rem;
		font-weight: 700;
		line-height: 1;
		user-select: none;
		color: #0f1613;
		font-family: var(--font-display, system-ui, sans-serif);
	}
	.card.red-suit .label {
		color: #b91c1c;
	}
	.card.face-down .symbol,
	.card.face-down .label {
		color: rgba(255, 255, 255, 0.9);
		filter: brightness(0.9);
	}
	.card.face-down .label {
		color: rgba(255, 255, 255, 0.6);
	}
	@media (min-width: 480px) {
		.card {
			--card-w: 4rem;
			--card-h: 5.5rem;
		}
		.symbol {
			font-size: 1.75rem;
		}
		.label {
			font-size: 1.1rem;
		}
	}
</style>
