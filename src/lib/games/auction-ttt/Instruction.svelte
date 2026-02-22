<script lang="ts">
	import { getContext } from 'svelte';
	import { Side } from '$lib/games/types.js';
	import type { RoomState } from '$lib/games/room.svelte.js';
	import type { AuctionTTTState } from './state.svelte.js';

	const room = getContext<RoomState>('room');
	const game = getContext<AuctionTTTState>('game');

	const isHost = $derived(room.pov === room.host);
	const bothJoined = $derived(
		game.players[Side.X].controller !== null && game.players[Side.O].controller !== null
	);
	const canStart = $derived(isHost && bothJoined);

	const iMyTurnToNominate = $derived(
		game.gameStage === 'nomination' &&
		game.players[game.nominatingPlayer as Side.X | Side.O].controller === room.pov
	);
	const iMyTurnToBid = $derived(
		game.gameStage === 'bidding' &&
		game.players[game.biddingPlayer as Side.X | Side.O].controller === room.pov
	);
</script>

<div class="instruction">
	{#if game.gameStage === 'pregame'}
		{#if canStart}
			<button onclick={() => room.sendAction({ type: 'start' })}>START GAME</button>
		{:else if isHost}
			<p>Waiting for both players to join&hellip;</p>
		{:else}
			<p>Waiting for the host to start the game&hellip;</p>
		{/if}
	{:else if game.gameStage === 'nomination'}
		{#if game.pendingNomination !== null}
			<p>Set your starting bid for this square.</p>
		{:else if iMyTurnToNominate}
			<p>Click a square to put it up for auction.</p>
		{:else}
			<p>Waiting for {game.nominatingPlayer} to nominate a square.</p>
		{/if}
	{:else if game.gameStage === 'bidding'}
		{#if iMyTurnToBid}
			<p>Make a bid on the square, or else pass.</p>
		{:else}
			<p>Waiting for {game.biddingPlayer} to bid.</p>
		{/if}
	{:else if game.gameStage === 'postgame'}
		<div class="postgame-actions">
			<button disabled={!canStart} onclick={() => room.sendAction({ type: 'start' })}>REMATCH</button>
		</div>
	{:else}
		<p>&nbsp;</p>
	{/if}
</div>

<style>
	.instruction {
		margin-top: 1.75rem;
		min-height: 2.5rem;
		align-items: center;
	}

	.postgame-actions {
		flex-flow: row;
		gap: 1rem;
	}

	p {
		margin: 0;
	}
</style>
