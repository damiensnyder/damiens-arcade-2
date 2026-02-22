<script lang="ts">
	import { getContext } from 'svelte';
	import Square from './Square.svelte';
	import { Side } from '$lib/games/types.js';
	import type { AuctionTTTState } from './state.svelte.js';

	const game = getContext<AuctionTTTState>('game');

	const isPostgame = $derived(game.gameStage === 'postgame');
	const hasWinner = $derived(isPostgame && game.winner !== null && game.winner.winningSide !== Side.None);

	// Winning line coordinates mapped to the SVG viewBox (0 0 300 300)
	// Each cell is 100 units wide with 2px gaps — approximate to 100 per cell
	function lineCoord(pos: [number, number], start: [number, number], end: [number, number]): [number, number] {
		const [r, c] = pos;
		const [rs, cs] = start;
		const [re, ce] = end;
		// Column-fixed (vertical line): center of column
		const x = cs === ce ? 50 + 100 * c : 10 + 140 * c;
		// Row-fixed (horizontal line): center of row
		const y = rs === re ? 50 + 100 * r : 10 + 140 * r;
		return [x, y];
	}
</script>

<div class="board">
	{#each [0, 1, 2] as row}
		{#each [0, 1, 2] as col}
			<Square {row} {col} />
		{/each}
	{/each}

	{#if hasWinner && game.winner}
		{@const [x1, y1] = lineCoord(game.winner.start, game.winner.start, game.winner.end)}
		{@const [x2, y2] = lineCoord(game.winner.end, game.winner.start, game.winner.end)}
		<svg viewBox="0 0 300 300">
			<line
				{x1}
				{y1}
				{x2}
				{y2}
				stroke={game.winner.winningSide === Side.X ? '#d48' : '#3bd'}
				stroke-width={3}
				stroke-linecap="round"
			/>
		</svg>
	{/if}

	{#if isPostgame && game.winner}
		<div class="winner-overlay">
			{#if game.winner.winningSide !== Side.None}
				<span>{game.winner.winningSide} wins!</span>
			{:else}
				<span style="border-color: var(--bg-5);">It's a draw.</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.board {
		position: relative;
		display: grid;
		grid-template-rows: repeat(3, 9rem);
		grid-template-columns: repeat(3, 9rem);
		gap: 2px;
		background-color: var(--text-1);
	}

	svg {
		position: absolute;
		inset: -1px;
		z-index: 1;
		pointer-events: none;
	}

	.winner-overlay {
		position: absolute;
		inset: 0;
		justify-content: center;
		align-items: center;
	}

	span {
		z-index: 2;
		padding: 0.5rem 0.5rem 0.3rem;
		font-size: 1.4rem;
		border: 2px solid var(--accent-1);
		border-radius: 8px;
		color: var(--text-2);
		background-color: var(--bg-3);
		opacity: 90%;
	}
</style>
