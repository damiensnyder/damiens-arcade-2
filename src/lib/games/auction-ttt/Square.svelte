<script lang="ts">
	import { getContext } from 'svelte';
	import X from './X.svelte';
	import O from './O.svelte';
	import { Side } from '$lib/games/types.js';
	import type { RoomState } from '$lib/games/room.svelte.js';
	import type { AuctionTTTState } from './state.svelte.js';

	let { row, col }: { row: number; col: number } = $props();

	const room = getContext<RoomState>('room');
	const game = getContext<AuctionTTTState>('game');

	const thisSquare = $derived(game.squares[row][col]);
	const isNominated = $derived(
		game.nominatedSquare !== null && game.nominatedSquare.row === row && game.nominatedSquare.col === col
	);
	const isPendingNomination = $derived(
		game.pendingNomination !== null && game.pendingNomination.row === row && game.pendingNomination.col === col
	);
	const iMyTurnToNominate = $derived(
		game.gameStage === 'nomination' &&
		game.players[game.nominatingPlayer as Side.X | Side.O].controller === room.pov
	);
	const iMyTurnToBid = $derived(
		game.gameStage === 'bidding' &&
		game.players[game.biddingPlayer as Side.X | Side.O].controller === room.pov &&
		isNominated
	);
	const maxBid = $derived(
		game.gameStage === 'bidding'
			? game.players[game.biddingPlayer as Side.X | Side.O].money
			: game.players[game.nominatingPlayer as Side.X | Side.O].money
	);

	function startNominate() {
		game.pendingNomination = { row, col };
		game.pendingBidAmount = 0;
	}

	function cancelNominate() {
		game.pendingNomination = null;
	}

	function submitNominate() {
		room.sendAction({ type: 'nominate', row, col, startingBid: game.pendingBidAmount });
		game.pendingNomination = null;
	}

	function submitBid() {
		room.sendAction({ type: 'bid', amount: game.pendingBidAmount });
	}

	function submitPass() {
		room.sendAction({ type: 'pass' });
	}
</script>

<div class="outer">
	{#if thisSquare === Side.X}
		<X size={140} />
	{:else if thisSquare === Side.O}
		<O size={140} />
	{:else if iMyTurnToBid}
		<!-- Mobile: show pending bid amount (controls live in Instruction area) -->
		<span class="last-bid bid-mobile">${game.pendingBidAmount}</span>
		<!-- Desktop: inline bid form -->
		<div class="interactive bid-desktop">
			<p>Bid:</p>
			<div class="form-field">
				<input type="number" min={game.currentBid + 1} max={maxBid} bind:value={game.pendingBidAmount} />
				<input type="submit" value="BID" style="margin-top: 0;" onclick={submitBid} />
			</div>
			<div class="form-field">
				<input type="submit" class="cancel" value="PASS" onclick={submitPass} />
			</div>
		</div>
	{:else if isPendingNomination}
		<!-- Mobile: show pending amount (controls live in Instruction area) -->
		<span class="last-bid bid-mobile">${game.pendingBidAmount}</span>
		<!-- Desktop: inline starting-bid form -->
		<div class="interactive bid-desktop">
			<p>Starting bid:</p>
			<div class="form-field">
				<input type="number" min={0} max={maxBid} bind:value={game.pendingBidAmount} />
				<input type="submit" value="BID" style="margin-top: 0;" onclick={submitNominate} />
			</div>
			<div class="form-field">
				<input type="submit" class="cancel" value="CANCEL" onclick={cancelNominate} />
			</div>
		</div>
	{:else if iMyTurnToNominate && thisSquare === Side.None}
		<button class="nominate" onclick={startNominate}>Nominate</button>
	{:else if isNominated}
		<span class="last-bid">${game.currentBid}</span>
	{/if}
</div>

<style>
	.outer {
		height: 100%;
		width: 100%;
		justify-content: center;
		align-items: center;
		background-color: var(--bg-1);
	}

	/* Scale SVG pieces to fit within the cell on small screens */
	.outer :global(svg) {
		max-width: 88%;
		max-height: 88%;
	}

	.interactive {
		padding: 0.25rem;
	}

	.nominate {
		padding: 0;
		margin-top: 0;
		justify-self: unset;
		font-family: var(--font-main);
		height: 70%;
		width: 70%;
		border-radius: 0.75rem;
		color: #668;
		background-color: var(--bg-2);
		box-shadow:
			0.5rem 0.5rem 1rem var(--bg-2),
			0.5rem -0.5rem 1rem var(--bg-2),
			-0.5rem -0.5rem 1rem var(--bg-2),
			-0.5rem 0.5rem 1rem var(--bg-2);
		border: 0.5rem solid transparent;
		opacity: 0;
		transition: opacity 0.2s ease-in-out;
	}

	.nominate:hover {
		opacity: 100%;
		transition: opacity 0.1s ease-in-out;
	}

	.cancel {
		margin-top: 0.5rem;
		flex: 1;
	}

	.last-bid {
		font-size: 2.5rem;
		font-weight: 200;
	}

	p {
		margin: 0 0 0.5rem;
	}

	input[type='number'] {
		width: 2.5rem;
	}

	/* Mobile: show amount in square, hide the inline form */
	.bid-mobile { display: flex; }
	.bid-desktop { display: none; }

	@media (min-width: 900px) {
		.bid-mobile { display: none; }
		.bid-desktop { display: flex; }
	}
</style>
