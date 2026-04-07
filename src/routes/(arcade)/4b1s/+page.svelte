<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Game } from '$lib/games/4b1s/game.js';
	import { Tutorial1 } from '$lib/games/4b1s/scenes/tutorial1.js';

	let wrapper: HTMLDivElement;
	let canvasArea: HTMLDivElement;
	let container: HTMLDivElement;
	let game: Game;
	let fullscreen = false;

	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			wrapper.requestFullscreen();
		} else {
			document.exitFullscreen();
		}
	}

	function onFullscreenChange() {
		fullscreen = !!document.fullscreenElement;
	}

	let observer: ResizeObserver | null = null;

	onMount(async () => {
		game = new Game();
		await game.init();
		container.appendChild(game.app.canvas);

		const scene = new Tutorial1(game.app);
		game.setScene(scene);

		observer = new ResizeObserver((entries) => {
			const { width, height } = entries[0].contentRect;
			if (width <= 0 || height <= 0) return;
			const scale = Math.min(width / 16, height / 9);
			const w = Math.floor(scale * 16);
			const h = Math.floor(scale * 9);
			container.style.width = `${w}px`;
			container.style.height = `${h}px`;
			game.resize(w, h);
		});
		observer.observe(canvasArea);

		document.addEventListener('fullscreenchange', onFullscreenChange);
	});

	onDestroy(() => {
		observer?.disconnect();
		document.removeEventListener('fullscreenchange', onFullscreenChange);
		game?.destroy();
	});
</script>

<svelte:head>
	<title>4 Birds 1 Scone</title>
</svelte:head>

<div class="page-wrapper" bind:this={wrapper}>
	{#if !fullscreen}
		<div class="header">
			<a href="/">4 Birds 1 Scone</a>
			<button onclick={toggleFullscreen}>Fullscreen</button>
		</div>
	{/if}

	<div class="canvas-area" bind:this={canvasArea}>
		<div class="canvas-container" bind:this={container}></div>
	</div>
</div>

<style>
	.page-wrapper {
		height: 100vh;
		overflow: hidden;
		background: var(--bg-1);
	}

	.header {
		height: 3rem;
		flex-shrink: 0;
		display: flex;
		flex-flow: row;
		align-items: center;
		justify-content: space-between;
		padding: 0 1.5rem;
		border-bottom: 1px solid var(--bg-5);
		background-color: var(--bg-1);
	}

	.header a {
		font-size: 1.5rem;
		font-family: var(--font-subtitle);
		color: var(--text-2);
		text-decoration: none;
	}

	.header button {
		margin-top: 0;
		cursor: pointer;
		padding: 0.18rem 0.5rem;
		border-radius: 0.5rem;
		border: 2px solid var(--text-3);
		font-family: var(--font-subtitle);
		font-size: 1rem;
		color: var(--text-2);
		background-color: var(--accent-2);
	}

	.canvas-area {
		flex: 1;
		width: 100%;
		overflow: hidden;
		align-items: center;
		justify-content: center;
	}
</style>
