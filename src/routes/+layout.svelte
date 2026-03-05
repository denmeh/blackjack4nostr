<script lang="ts">
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
		<div class="brand">Blackjack4Nostr</div>
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
		padding: 0.75rem 1rem;
		background: #1e293b;
		border-bottom: 1px solid #334155;
		font-family: var(--font-sans, system-ui, sans-serif);
		font-size: 0.9rem;
		color: #f1f5f9;
	}
	.brand {
		font-weight: 600;
		color: #fff;
	}
	.user {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.user .label {
		color: #94a3b8;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.npub {
		font-size: 0.85em;
		background: #334155;
		color: #e2e8f0;
		padding: 0.25em 0.5em;
		border-radius: 4px;
		white-space: nowrap;
		overflow: hidden;
		max-width: 10ch;
	}
	.balance {
		font-weight: 600;
		color: #e2e8f0;
	}
	.balance-err {
		color: #f87171;
		font-size: 0.85em;
	}
	.logout {
		padding: 0.35rem 0.6rem;
		font-size: 0.8rem;
		background: #334155;
		border: 1px solid #475569;
		color: #cbd5e1;
		border-radius: 6px;
		cursor: pointer;
	}
	.logout:hover {
		background: #475569;
		color: #fff;
	}
	.loading {
		padding: 3rem;
		text-align: center;
		font-family: var(--font-sans, system-ui, sans-serif);
		color: var(--muted, #888);
	}
</style>
