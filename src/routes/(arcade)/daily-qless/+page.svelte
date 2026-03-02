<script lang="ts">
	import { onMount } from 'svelte';
	import ArcadeHeader from '$lib/components/ArcadeHeader.svelte';
	import { gameIsWon, getAllWords, getBadges, gridIsLegal } from '$lib/games/qless/utils.js';
	import type { WordInGrid, Badge } from '$lib/games/qless/types.js';
	import { ROWS, COLS } from '$lib/games/qless/utils.js';

	let { data } = $props();

	const { roll, legalWords } = data;
	const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

	// Grid state: ROWS × COLS, letters start in a 3×4 block at rows 0-2, cols 4-7
	let grid = $state<string[][]>(Array.from({ length: ROWS }, () => Array(COLS).fill('')));
	grid[0].splice(4, 4, ...roll.substring(0, 4).split(''));
	grid[1].splice(4, 4, ...roll.substring(4, 8).split(''));
	grid[2].splice(4, 4, ...roll.substring(8, 12).split(''));

	// shownGrid is what's rendered — differs from grid during a drag preview
	let shownGrid = $state<string[][]>(grid.map((row) => row.slice()));

	let startTime = 0;
	let solveTime = $state(0);
	let showWin = $state(false);
	let showInstructions = $state(false);

	let outerEl: HTMLDivElement;
	let innerEl: HTMLDivElement;

	// Drag state
	let dragging = $state({ x: -1, y: -1 });
	let over = $state({ x: -1, y: -1 });
	let touching = $state(false);
	let touchPos = $state({ x: 0, y: 0 });

	let words = $state<WordInGrid[]>([]);
	let isLegal = $state<boolean[][]>(Array.from({ length: ROWS }, () => Array(COLS).fill(false)));
	let badges = $state<Badge[]>([]);

	onMount(() => {
		words = getAllWords(grid);
		checkForWin();
		// Scroll the initial letter cluster into view
		innerEl.children[7]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		startTime = Date.now();
	});

	function checkForWin() {
		const legality = gridIsLegal(legalWords, words);
		isLegal = legality.gridLegality;
		if (!legality.illegalWordFound && gameIsWon(grid)) {
			solveTime = (Date.now() - startTime) / 1000;
			showWin = true;
			badges = getBadges(grid, words, solveTime);
		}
	}

	// --- Drag and drop (desktop) ---

	function handleDragStart(x: number, y: number) {
		dragging = { x, y };
	}

	function handleDragEnter(x: number, y: number) {
		if (dragging.x === -1 || shownGrid[x][y] !== '') return;
		const prev = over;
		over = { x, y };
		shownGrid[dragging.x][dragging.y] = '';
		if (prev.x !== -1) shownGrid[prev.x][prev.y] = '';
		shownGrid[x][y] = grid[dragging.x][dragging.y];
	}

	function handleDragEnd() {
		if (over.x !== dragging.x || over.y !== dragging.y) {
			grid[over.x][over.y] = grid[dragging.x][dragging.y];
			grid[dragging.x][dragging.y] = '';
		}
		dragging = { x: -1, y: -1 };
		over = { x: -1, y: -1 };
		shownGrid = grid.map((row) => row.slice());
		words = getAllWords(grid);
		checkForWin();
	}

	// --- Touch (mobile) ---

	function handleTouchStart(e: TouchEvent, x: number, y: number) {
		if (grid[x][y] === '') return;
		e.preventDefault();
		dragging = { x, y };
		touching = true;
		shownGrid[dragging.x][dragging.y] = '';
		touchPos = { x: e.targetTouches[0].pageX, y: e.targetTouches[0].pageY };
	}

	function handleTouchMove(e: TouchEvent) {
		touchPos = { x: e.targetTouches[0].pageX, y: e.targetTouches[0].pageY };
	}

	function rectContains(rect: DOMRect, pos: { x: number; y: number }): boolean {
		return rect.x - 5 <= pos.x && pos.x <= rect.x + rect.width + 5 &&
		       rect.y - 5 <= pos.y && pos.y <= rect.y + rect.height + 5;
	}

	function handleTouchEnd() {
		touching = false;
		let dest = dragging;

		if (rectContains(outerEl.getBoundingClientRect(), touchPos)) {
			for (let i = 0; i < innerEl.children.length; i++) {
				const el = innerEl.children[i] as HTMLElement;
				if (el.classList.contains('cell') && !el.classList.contains('touch') &&
				    rectContains(el.getBoundingClientRect(), touchPos)) {
					dest = {
						x: parseInt(el.style.gridRowStart) - 1,
						y: parseInt(el.style.gridColumnStart) - 1
					};
					break;
				}
			}
		}

		if (grid[dest.x][dest.y] === '') {
			grid[dest.x][dest.y] = grid[dragging.x][dragging.y];
			grid[dragging.x][dragging.y] = '';
		}
		dragging = { x: -1, y: -1 };
		over = { x: -1, y: -1 };
		shownGrid = grid.map((row) => row.slice());
		words = getAllWords(grid);
		checkForWin();
	}

	// --- Share ---

	async function share() {
		const mins = Math.floor(solveTime / 60);
		const secs = Math.floor(solveTime % 60);
		const timeStr = solveTime <= 600
			? `Solved in ${mins}:${secs < 10 ? '0' : ''}${secs}`
			: 'Solved!';
		const badgeStr = badges.length > 0
			? '\nBadges: ' + badges.map((b) => `${b.name} ${b.icon}`).join(', ')
			: '';
		const text = `Daily Q-less for ${dateStr}\n${timeStr}${badgeStr}`;
		try {
			if (navigator.canShare?.({ text })) {
				await navigator.share({ text, title: 'Daily Q-less solution' });
			} else {
				await navigator.clipboard.writeText(text);
			}
		} catch {
			// ignore
		}
	}
</script>

<svelte:head>
	<title>Daily Q-less — Damien's Arcade</title>
</svelte:head>

<ArcadeHeader href="/" title="Daily Q-less">
	{#snippet end()}
		<button class="how-to-play-btn" onclick={() => (showInstructions = true)} disabled={showInstructions || showWin}>
			How to Play
		</button>
	{/snippet}
</ArcadeHeader>

<div class="grid-outer" bind:this={outerEl}>
	<div
		class="grid-inner"
		bind:this={innerEl}
		ondragover={(e) => e.preventDefault()}
	>
		{#each shownGrid as row, x}
			{#each row as cell, y}
				<div
					class="cell"
					class:filled={cell !== ''}
					class:legal={isLegal[x][y]}
					style:grid-row-start={x + 1}
					style:grid-column-start={y + 1}
					draggable={grid[x][y] !== ''}
					ondragstart={() => handleDragStart(x, y)}
					ondragenter={() => handleDragEnter(x, y)}
					ondragend={handleDragEnd}
					ondragover={(e) => e.preventDefault()}
					ontouchstart={(e) => handleTouchStart(e, x, y)}
					ontouchmove={handleTouchMove}
					ontouchend={handleTouchEnd}
				>
					{cell}
				</div>
			{/each}
		{/each}

		{#if touching}
			<div
				class="cell filled touch"
				style:transform={`translate(${touchPos.x - 20}px, ${touchPos.y - 20}px)`}
			>
				{grid[dragging.x][dragging.y]}
			</div>
		{/if}
	</div>
</div>

{#if showInstructions}
	<div class="dialog-outer">
		<div class="dialog">
			<h2>How to Play</h2>
			<ul>
				<li>Drag the letters around the grid to make a crossword</li>
				<li>All words must be 3 letters or longer</li>
				<li>No abbreviations or proper nouns</li>
				<li>If a word is legal the letters will light up</li>
			</ul>
			<button onclick={() => (showInstructions = false)}>Got it</button>
		</div>
	</div>
{/if}

{#if showWin}
	<div class="dialog-outer">
		<div class="dialog">
			<h2>You won!</h2>

			{#if solveTime < 600}
				<p>And it only took you</p>
				<h1 class="solve-time">
					{Math.floor(solveTime / 60)}:{Math.floor(solveTime % 60) < 10 ? '0' : ''}{Math.floor(solveTime % 60)}
				</h1>
			{/if}

			{#if badges.length > 0}
				<div class="badges-outer">
					{#each badges as badge}
						<div class="badge-row horiz">
							<div class="badge-icon">{badge.icon}</div>
							<div class="badge-text">
								<h3 class="badge-name">{badge.name}</h3>
								<p class="badge-description">{badge.description}</p>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<p>Want to play again? Wait until tomorrow or <a href="https://q-lessgame.com/" target="_blank" rel="noopener noreferrer">buy the real game</a>.</p>

			<div class="dialog-actions horiz">
				<button onclick={share}>Share</button>
				<button onclick={() => (showWin = false)}>Close</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(.how-to-play-btn) {
		margin: 0;
		padding: 0.3rem 0.75rem;
		font-size: 0.9rem;
	}

	.grid-outer {
		max-width: 70vw;
		max-height: 60vh;
		margin: 2rem auto;
		overflow: auto;
		border-radius: 0.75rem;
		background-color: var(--bg-1);
		/* safe center doesn't work on Safari; margin: auto on inner handles it */
		display: flex;
		justify-content: flex-start;
		align-items: safe center;
	}

	.grid-inner {
		margin: auto;
		display: grid;
		gap: 0.75rem;
		grid-template-rows: repeat(11, 3rem);
		grid-template-columns: repeat(12, 3rem);
		padding: 0.6rem;
		font-size: 1.5rem;
		font-weight: 700;
		text-transform: uppercase;
		user-select: none;
	}

	.cell {
		width: 3rem;
		height: 3rem;
		background-color: var(--bg-2);
		display: flex;
		justify-content: center;
		align-items: center;
		border-radius: 0.25rem;
	}

	.filled {
		background-color: var(--bg-5);
		cursor: grab;
	}

	.touch {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 1;
	}

	.legal {
		color: var(--accent-1);
	}

	/* Dialogs */
	.dialog-outer {
		position: fixed;
		inset: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 10;
		background-color: rgba(0, 0, 0, 0.4);
	}

	.dialog {
		padding: 2rem;
		background-color: var(--bg-3);
		border: 2px solid var(--text-2);
		border-radius: 1.5rem;
		max-width: min(36rem, 90vw);
		align-items: center;
	}

	.solve-time {
		margin: 0.75rem;
	}

	ul {
		margin: 1rem;
		align-self: flex-start;
	}

	li {
		margin: 0.5rem 0;
	}

	p {
		margin: 0.75rem 0;
		text-align: center;
	}

	.dialog-actions {
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.dialog-actions button {
		margin-top: 0;
	}

	.badges-outer {
		align-self: stretch;
		margin: 0.5rem 0;
	}

	.badge-row {
		align-items: center;
		padding: 0.25rem 0;
	}

	.badge-icon {
		font-size: 2.5rem;
		margin: 0 0.75rem 0.25rem 0.25rem;
		flex-shrink: 0;
	}

	.badge-text {
		align-items: flex-start;
	}

	.badge-name {
		margin: 0 0 0.15rem;
	}

	.badge-description {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-3);
	}

	/* Tablet */
	@media only screen and (min-width: 720px) and (max-width: 1200px) {
		.grid-outer {
			max-width: 85vw;
			max-height: 80vh;
			margin: 1rem auto;
		}
	}

	/* Mobile */
	@media only screen and (max-width: 720px) {
		.grid-outer {
			max-width: 95vw;
			max-height: 75vh;
			margin: 0.5rem auto;
		}

		.grid-inner {
			/* Shrink tiles slightly on mobile */
			gap: 0.5rem;
			grid-template-rows: repeat(11, 2.25rem);
			grid-template-columns: repeat(12, 2.25rem);
			font-size: 1.1rem;
		}

		.cell {
			width: 2.25rem;
			height: 2.25rem;
		}

		.dialog {
			padding: 1.25rem 0.75rem;
		}
	}
</style>
