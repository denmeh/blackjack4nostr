<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import favicon from '$lib/assets/favicon.svg';
	import { initNostr } from '$lib/nostr';
	import {
		loadSession,
		hasSession,
		isLoggedIn,
		npub,
		nwcBalance,
		nwcBalanceError,
		fetchNwcBalance,
		clearSession
	} from '$lib/session';

	let { children } = $props();
	let mounted = $state(false);

	onMount(() => {
		initNostr();
		loadSession();
		mounted = true;
	});

	// Redirect to setup when not logged in (client-only)
	$effect(() => {
		if (!mounted || typeof window === 'undefined') return;
		const path = $page.url.pathname;
		if (!hasSession() && path !== '/setup') {
			goto('/setup');
		}
	});

	// Fetch NWC balance when logged in
	$effect(() => {
		if ($isLoggedIn && mounted) {
			fetchNwcBalance();
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if !mounted}
	<div class="loading">Loading…</div>
{:else if !hasSession() && $page.url.pathname !== '/setup'}
	<div class="loading">Redirecting to setup…</div>
{:else}
	{#if $isLoggedIn}
	<header class="header">
		<div class="brand">
			<span class="brand-icon">♠</span>
			Blackjack<span class="brand-accent">4Nostr</span>
		</div>
		<div class="user">
			<span class="label">npub</span>
			<code class="npub" title={$npub ?? ''}>{$npub ? $npub.slice(0, 5) + '…' + $npub.slice(-6) : ''}</code>
			<span class="label">Balance</span>
			<span class="balance">
				{#if $nwcBalanceError}
					<span class="balance-err">{$nwcBalanceError}</span>
				{:else if $nwcBalance !== null}
					{$nwcBalance >= 1000n
						? ($nwcBalance / 1000n).toString() + 'k'
						: $nwcBalance.toString()} sats
				{:else}
					—
				{/if}
			</span>
			<button
				class="logout"
				onclick={() => {
					clearSession();
					goto('/setup');
				}}
				type="button"
			>
				Log out
			</button>
		</div>
	</header>
	{/if}

	{@render children()}
{/if}

<style>
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 1.25rem;
		padding-top: max(0.6rem, env(safe-area-inset-top));
		padding-left: max(1.25rem, env(safe-area-inset-left));
		padding-right: max(1.25rem, env(safe-area-inset-right));
		background: var(--b4n-surface);
		border-bottom: 1px solid var(--b4n-border);
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
		font-size: 0.9rem;
		color: var(--b4n-text);
	}
	.brand {
		font-weight: 700;
		font-size: 1.1rem;
		letter-spacing: 0.02em;
		color: var(--b4n-text-bright);
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.brand-icon {
		color: var(--b4n-gold);
		font-size: 1.2em;
		opacity: 0.95;
	}
	.brand-accent {
		color: var(--b4n-gold);
		font-weight: 600;
	}
	.user {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.user .label {
		color: var(--b4n-text-muted);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.npub {
		font-family: var(--font-mono);
		font-size: 0.8em;
		background: var(--b4n-input-bg);
		color: var(--b4n-text);
		padding: 0.3em 0.55em;
		border-radius: 4px;
		border: 1px solid var(--b4n-input-border);
		white-space: nowrap;
		overflow: hidden;
		max-width: 10ch;
	}
	.balance {
		font-weight: 600;
		color: var(--b4n-gold-dim);
	}
	.balance-err {
		color: var(--b4n-lose);
		font-size: 0.85em;
	}
	.logout {
		padding: 0.4rem 0.75rem;
		font-size: 0.8rem;
		background: transparent;
		border: 1px solid var(--b4n-border);
		color: var(--b4n-text-muted);
		border-radius: 6px;
		cursor: pointer;
		font-weight: 500;
		min-height: var(--b4n-touch-min, 44px);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.logout:hover {
		background: var(--b4n-surface-elevated);
		color: var(--b4n-text);
		border-color: var(--b4n-gold-muted);
	}
	.loading {
		padding: 3rem;
		text-align: center;
		color: var(--b4n-text-muted);
	}
	@media (max-width: 480px) {
		.header {
			flex-wrap: wrap;
			gap: 0.75rem;
			padding: 0.6rem 0.75rem;
		}
		.brand {
			font-size: 1rem;
		}
		.user {
			width: 100%;
			justify-content: flex-end;
			gap: 0.5rem;
		}
		.user .label {
			display: none;
		}
		.npub {
			max-width: 8ch;
		}
	}
</style>
