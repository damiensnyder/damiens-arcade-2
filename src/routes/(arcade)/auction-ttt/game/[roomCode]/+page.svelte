<script lang="ts">
	import { setContext, onDestroy } from 'svelte';
	import { Side } from '$lib/games/types.js';
	import { RoomState } from '$lib/games/room.svelte.js';
	import { AuctionTTTState } from '$lib/games/auction-ttt/state.svelte.js';
	import type { AuctionTTTViewpoint, AuctionTTTEvent } from '$lib/games/auction-ttt/types.js';
	import Gameboard from '$lib/games/auction-ttt/Gameboard.svelte';
	import Player from '$lib/games/auction-ttt/Player.svelte';
	import PregamePlayer from '$lib/games/auction-ttt/PregamePlayer.svelte';
	import SettingsEditor from '$lib/games/auction-ttt/SettingsEditor.svelte';
	import Instruction from '$lib/games/auction-ttt/Instruction.svelte';
	import ArcadeHeader from '$lib/components/ArcadeHeader.svelte';

	let { data } = $props();

	const room = new RoomState();
	const game = new AuctionTTTState();

	setContext('room', room);
	setContext('game', game);

	$effect(() => {
		room.connect(data.roomCode);

		const unsubGamestate = room.onGamestate((state) => {
			game.applyGamestate(state as AuctionTTTViewpoint);
		});

		const unsubEvent = room.onEvent((event) => {
			game.handleEvent(event as AuctionTTTEvent);
		});

		return () => {
			unsubGamestate();
			unsubEvent();
			room.disconnect();
			game.destroy();
		};
	});

	const showBoard = $derived(game.gameStage !== 'pregame');
</script>

<svelte:head>
	<title>Auction Tic-Tac-Toe</title>
</svelte:head>

<div class="game-page">
	{#if room.errorMessage}
		<div class="error-overlay">
			<p>{room.errorMessage}</p>
			<a href="/auction-ttt">Back to lobby</a>
		</div>
	{/if}

	<ArcadeHeader href="/auction-ttt" title="Auction Tic-Tac-Toe" tag={data.roomCode} />

	<!-- Mobile layout: board/settings → instruction → players -->
	<div class="mobile-layout">
		<div class="main-area">
			{#if showBoard}
				<Gameboard />
			{:else}
				<SettingsEditor />
			{/if}
		</div>
		<Instruction />
		<div class="player-row horiz">
			{#if showBoard}
				<Player side={Side.X} />
				<Player side={Side.O} />
			{:else}
				<PregamePlayer side={Side.X} />
				<PregamePlayer side={Side.O} />
			{/if}
		</div>
	</div>

	<!-- Desktop layout: X | board/settings | O, instruction below -->
	<div class="desktop-layout">
		<div class="desktop-center">
			{#if showBoard}
				<div class="desktop-row">
					<div class="desktop-player">
						<Player side={Side.X} />
					</div>
					<Gameboard />
					<div class="desktop-player">
						<Player side={Side.O} />
					</div>
				</div>
			{:else}
				<div class="desktop-row">
					<div class="desktop-player">
						<PregamePlayer side={Side.X} />
					</div>
					<SettingsEditor />
					<div class="desktop-player">
						<PregamePlayer side={Side.O} />
					</div>
				</div>
			{/if}
			<Instruction />
		</div>
	</div>
</div>

<style>
	.game-page {
		width: 100%;
		min-height: 100vh;
		align-items: stretch;
	}

	.error-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: var(--bg-4);
		display: flex;
		flex-flow: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		font-size: 1.1rem;
		color: #f66;
	}

	.error-overlay a {
		color: var(--text-2);
		font-size: 1rem;
	}

	/* Mobile layout (default) */
	.mobile-layout {
		display: flex;
		flex-flow: column;
		align-items: center;
		padding: 0.75rem 1rem;
		gap: 0.5rem;
		flex: 1;
	}

	.desktop-layout {
		display: none;
	}

	.main-area {
		display: flex;
		justify-content: center;
	}

	.player-row {
		width: 100%;
		justify-content: space-around;
		margin-top: 0.5rem;
	}

	/* Desktop layout */
	@media (min-width: 900px) {
		.mobile-layout {
			display: none;
		}

		.desktop-layout {
			display: flex;
			flex: 1;
			justify-content: center;
			align-items: center;
			padding: 2rem 1rem;
		}

		.desktop-center {
			display: flex;
			flex-flow: column;
			align-items: center;
			gap: 0.5rem;
		}

		.desktop-row {
			display: flex;
			flex-flow: row;
			align-items: center;
			gap: 3rem;
		}

		.desktop-player {
			display: flex;
			flex-flow: column;
			align-items: center;
			min-width: 8rem;
		}
	}
</style>
