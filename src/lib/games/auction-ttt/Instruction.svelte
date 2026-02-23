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
	const iAmNominating = $derived(iMyTurnToNominate && game.pendingNomination !== null);
	const iMyTurnToBid = $derived(
		game.gameStage === 'bidding' &&
		game.players[game.biddingPlayer as Side.X | Side.O].controller === room.pov
	);

	const minBid = $derived(
		iAmNominating ? 0 : game.currentBid + 1
	);
	const maxBid = $derived(
		iMyTurnToBid
			? game.players[game.biddingPlayer as Side.X | Side.O].money
			: iAmNominating
				? game.players[game.nominatingPlayer as Side.X | Side.O].money
				: 0
	);

	function decrement() {
		if (game.pendingBidAmount > minBid) game.pendingBidAmount--;
	}
	function increment() {
		if (game.pendingBidAmount < maxBid) game.pendingBidAmount++;
	}
	function submitBid() {
		room.sendAction({ type: 'bid', amount: game.pendingBidAmount });
	}
	function submitPass() {
		room.sendAction({ type: 'pass' });
	}
	function submitNominate() {
		if (game.pendingNomination === null) return;
		room.sendAction({ type: 'nominate', row: game.pendingNomination.row, col: game.pendingNomination.col, startingBid: game.pendingBidAmount });
		game.pendingNomination = null;
	}
	function cancelNominate() {
		game.pendingNomination = null;
	}
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
		{#if iAmNominating}
			<!-- Desktop: plain instruction text -->
			<p class="bid-text-desktop">Set your starting bid for this square.</p>
			<!-- Mobile: inline starting-bid controls -->
			<div class="bid-controls-mobile horiz">
				<div class="stepper-group horiz">
					<button class="stepper" onclick={increment} disabled={game.pendingBidAmount >= maxBid}>+</button>
					<input type="number" min={minBid} max={maxBid} bind:value={game.pendingBidAmount} />
					<button class="stepper" onclick={decrement} disabled={game.pendingBidAmount <= minBid}>-</button>
				</div>
				<div class="action-group horiz">
					<input type="submit" value="BID" onclick={submitNominate} />
					<input type="submit" value="CANCEL" onclick={cancelNominate} />
				</div>
			</div>
		{:else if iMyTurnToNominate}
			<p>Click a square to put it up for auction.</p>
		{:else}
			<p>Waiting for {game.nominatingPlayer} to nominate a square.</p>
		{/if}
	{:else if game.gameStage === 'bidding'}
		{#if iMyTurnToBid}
			<!-- Desktop: plain instruction text -->
			<p class="bid-text-desktop">Make a bid on the square, or else pass.</p>
			<!-- Mobile: inline bid controls -->
			<div class="bid-controls-mobile horiz">
				<div class="stepper-group horiz">
					<button class="stepper" onclick={increment} disabled={game.pendingBidAmount >= maxBid}>+</button>
					<input type="number" min={minBid} max={maxBid} bind:value={game.pendingBidAmount} />
					<button class="stepper" onclick={decrement} disabled={game.pendingBidAmount <= minBid}>-</button>
				</div>
				<div class="action-group horiz">
					<input type="submit" value="BID" onclick={submitBid} />
					<input type="submit" value="PASS" onclick={submitPass} />
				</div>
			</div>
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
		width: 100%;
	}

	.postgame-actions {
		flex-flow: row;
		gap: 1rem;
	}

	p {
		margin: 0;
	}

	/* Mobile bid controls */
	.bid-text-desktop { display: none; }
	.bid-controls-mobile {
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
	}

	.stepper-group {
		align-items: center;
		gap: 0.15rem;
	}

	.action-group {
		align-items: center;
		gap: 0.25rem;
	}

	/* Normalize all interactive elements in the row to the same height */
	.bid-controls-mobile button,
	.bid-controls-mobile input[type='submit'],
	.bid-controls-mobile input[type='number'] {
		height: 2rem;
		margin: 0;
		box-sizing: border-box;
	}

	.bid-controls-mobile input[type='number'] {
		flex: 0 0 auto;
		width: 2.8rem;
		text-align: center;
		/* Hide native spin buttons */
		-moz-appearance: textfield;
	}

	.bid-controls-mobile input[type='number']::-webkit-outer-spin-button,
	.bid-controls-mobile input[type='number']::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.bid-controls-mobile input[type='submit'] {
		padding-left: 0.6rem;
		padding-right: 0.6rem;
	}

	.stepper {
		padding-top: 0;
		padding-bottom: 0.175rem;
		padding-left: 0.5rem;
		padding-right: 0.5rem;
		font-size: 1.2rem;
		font-family: system-ui, sans-serif;
		font-weight: 700;
	}


	@media (min-width: 900px) {
		.bid-text-desktop { display: block; }
		.bid-controls-mobile { display: none; }

		.instruction {
			margin-top: 1.75rem;
			width: auto;
		}
	}

	@media (max-width: 899px) {
		.instruction {
			margin-top: 0.5rem;
		}
	}
</style>
