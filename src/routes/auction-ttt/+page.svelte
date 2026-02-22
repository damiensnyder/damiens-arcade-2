<script lang="ts">
	import { goto } from '$app/navigation';
	import { getWsUrl } from '$lib/ws/client.js';

	let joinCode = $state('');
	let creating = $state(false);
	let errorMsg = $state('');

	async function createRoom() {
		creating = true;
		errorMsg = '';
		try {
			const roomCode = await createRoomViaWS();
			goto(`/auction-ttt/game/${roomCode}`);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to create room';
			creating = false;
		}
	}

	function createRoomViaWS(): Promise<string> {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(getWsUrl());
			ws.onopen = () => ws.send(JSON.stringify({ type: 'createRoom', gameType: 'auction-ttt' }));
			ws.onmessage = (e) => {
				const msg = JSON.parse(e.data as string);
				if (msg.type === 'roomCreated') {
					ws.close();
					resolve(msg.roomCode as string);
				} else if (msg.type === 'error') {
					ws.close();
					reject(new Error(msg.message as string));
				}
			};
			ws.onerror = () => reject(new Error('Connection failed'));
		});
	}

	function joinRoom() {
		const code = joinCode.trim().toUpperCase();
		if (code.length === 4) goto(`/auction-ttt/game/${code}`);
	}

	function handleJoinKey(e: KeyboardEvent) {
		if (e.key === 'Enter') joinRoom();
	}
</script>

<svelte:head>
	<title>Auction Tic-Tac-Toe — Damien's Arcade</title>
</svelte:head>

<div class="page">
	<header>
		<a href="/"><h1>Damien's Arcade</h1></a>
	</header>

	<div class="content">
		<div class="left-col">
			<h2>Auction Tic-Tac-Toe</h2>
			<div class="room-section top-level-menu">
				<button onclick={createRoom} disabled={creating}>
					{creating ? 'Creating…' : 'Create Room'}
				</button>
				{#if errorMsg}
					<p class="error">{errorMsg}</p>
				{/if}
				<div class="join-row horiz">
					<input
						type="text"
						placeholder="Room code"
						maxlength={4}
						bind:value={joinCode}
						onkeydown={handleJoinKey}
					/>
					<button onclick={joinRoom} style="margin-top: 0;">Join Room</button>
				</div>
			</div>
		</div>

		<div class="right-col">
			<h2>How to play</h2>
			<div class="how-to-play top-level-menu">
				<!-- <iframe
					width="100%"
					style="aspect-ratio: 16/9;"
					src="https://www.youtube.com/embed/dQw4w9WgXcQ"
					title="How to play Auction Tic-Tac-Toe"
					frameborder="0"
					allowfullscreen
				></iframe> -->
				<ol>
					<li>Each player starts with a set amount of money (default $15).</li>
					<li>The starting player nominates a square and sets an opening bid.</li>
					<li>Players alternate bidding until one player passes.</li>
					<li>The winning bidder pays their bid and claims the square.</li>
					<li>The other player then nominates the next square.</li>
					<li>First to get three in a row wins, or fill the board for a draw.</li>
				</ol>
			</div>
		</div>
	</div>
</div>

<style>
	.page {
		width: 100%;
		min-height: 100vh;
		align-items: stretch;
	}

	header {
		position: sticky;
		top: 0;
		background-color: var(--bg-1);
		border-bottom: 1px solid var(--bg-5);
		padding: 0.5rem 1.5rem;
		z-index: 10;
	}

	header a {
		text-decoration: none;
	}

	header h1 {
		font-size: 1.5rem;
		margin: 0;
		text-align: left;
	}

	.content {
		padding: 1.5rem;
		gap: 1.5rem;
	}

	.left-col,
	.right-col {
		width: 100%;
	}

	.room-section {
		gap: 0.75rem;
	}

	.join-row {
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.join-row input {
		flex: 1;
		margin: 0;
	}

	.join-row input:not(:placeholder-shown) {
		text-transform: uppercase;
	}

	.join-row button {
		white-space: nowrap;
	}

	.how-to-play {
		gap: 1rem;
	}

	ol {
		margin: 0;
		padding-left: 1.5rem;
	}

	li {
		margin-bottom: 0.4rem;
	}

	.error {
		color: #f66;
		margin: 0;
		font-size: 0.9rem;
	}

	@media (min-width: 720px) {
		.content {
			flex-flow: row;
			align-items: flex-start;
		}

		.left-col {
			flex: 0 0 20rem;
		}

		.right-col {
			flex: 1;
		}
	}
</style>
