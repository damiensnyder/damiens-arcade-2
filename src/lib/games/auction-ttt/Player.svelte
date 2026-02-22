<script lang="ts">
	import { getContext } from 'svelte';
	import X from './X.svelte';
	import O from './O.svelte';
	import { Side, oppositeSideOf } from '$lib/games/types.js';
	import { formatTime } from './utils.js';
	import type { RoomState } from '$lib/games/room.svelte.js';
	import type { AuctionTTTState } from './state.svelte.js';

	let { side }: { side: Side.X | Side.O } = $props();

	const room = getContext<RoomState>('room');
	const game = getContext<AuctionTTTState>('game');

	const player = $derived(game.players[side]);
	const isMyTurn = $derived(
		(game.gameStage === 'nomination' && game.nominatingPlayer === side) ||
		(game.gameStage === 'bidding' && game.biddingPlayer === side)
	);
	const isMe = $derived(player.controller === room.pov);
	const isOtherSideMe = $derived(
		game.players[oppositeSideOf(side)].controller === room.pov
	);
	// "(open)" only makes sense in pregame when you already hold the other side
	const showOpen = $derived(
		player.controller === null && isOtherSideMe && game.gameStage === 'pregame'
	);
	const canReplace = $derived(player.controller === null && !isMe && !showOpen);
</script>

<div class="player">
	<div class="player-label">
		{#if isMe}
			<span class="label">(you)</span>
		{:else if showOpen}
			<span class="label">(open)</span>
		{:else if canReplace}
			<button onclick={() => room.sendAction({ type: 'join', side })}>REPLACE</button>
		{/if}
	</div>
	{#if side === Side.X}
		<X size={180} />
	{:else}
		<O size={180} />
	{/if}
	<span class="money" class:active={isMyTurn}>
		${player.money}
		{#if game.settings.useTiebreaker}
			&middot; {formatTime(game.displayTimeTaken[side])}
		{/if}
	</span>
</div>

<style>
	.player {
		position: relative;
		align-items: center;
	}

	.money {
		font-size: 1.5rem;
		margin-top: 1rem;
	}

	.active {
		color: #ee6;
	}

	/* Mobile: label/button appears above the symbol (natural flow) */
	.player-label {
		align-items: center;
		min-height: 2.2rem;
		justify-content: center;
	}

	.player-label button {
		margin-top: 0;
	}

	.label {
		color: var(--text-4);
	}

	/* Desktop: float the label below, keep the symbol on top */
	@media (min-width: 900px) {
		.player-label {
			position: absolute;
			bottom: -1.8rem;
			min-height: unset;
		}
	}
</style>
