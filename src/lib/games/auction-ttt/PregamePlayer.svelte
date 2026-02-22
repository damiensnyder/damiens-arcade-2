<script lang="ts">
	import { getContext } from 'svelte';
	import X from './X.svelte';
	import O from './O.svelte';
	import { Side } from '$lib/games/types.js';
	import type { RoomState } from '$lib/games/room.svelte.js';
	import type { AuctionTTTState } from './state.svelte.js';

	let { side }: { side: Side.X | Side.O } = $props();

	const room = getContext<RoomState>('room');
	const game = getContext<AuctionTTTState>('game');

	const player = $derived(game.players[side]);
	const isMe = $derived(player.controller === room.pov);
	const isTaken = $derived(player.controller !== null && !isMe);
</script>

<div class="pregame-player">
	{#if side === Side.X}
		<X size={180} />
	{:else}
		<O size={180} />
	{/if}
	{#if isMe}
		<button onclick={() => room.sendAction({ type: 'leave', side })}>LEAVE</button>
	{:else if isTaken}
		<button disabled>JOIN</button>
	{:else}
		<button onclick={() => room.sendAction({ type: 'join', side })}>JOIN</button>
	{/if}
</div>

<style>
	.pregame-player {
		align-items: center;
		gap: 0.5rem;
	}

	button {
		margin-top: 0.5rem;
	}
</style>
