<script lang="ts">
	import { goto } from '$app/navigation';
	import { getWsUrl } from '$lib/ws/client.js';
	import ArcadeHeader from '$lib/components/ArcadeHeader.svelte';

	let joinCode = $state('');
	let creating = $state(false);
	let errorMsg = $state('');

	async function createRoom() {
		creating = true;
		errorMsg = '';
		try {
			const roomCode = await createRoomViaWS();
			goto(`/mayhem-manager/game/${roomCode}`);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to create room';
			creating = false;
		}
	}

	function createRoomViaWS(): Promise<string> {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(getWsUrl());
			ws.onopen = () => ws.send(JSON.stringify({ type: 'createRoom', gameType: 'mayhem-manager' }));
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
		if (code.length === 4) goto(`/mayhem-manager/game/${code}`);
	}

	function handleJoinKey(e: KeyboardEvent) {
		if (e.key === 'Enter') joinRoom();
	}
</script>

<svelte:head>
	<title>Mayhem Manager — Damien's Arcade</title>
</svelte:head>

<div class="page">
	<ArcadeHeader href="/" title="Damien's Arcade" />

	<div class="content">
		<div class="left-col">
			<h2>Mayhem Manager</h2>
			<div class="room-section top-level-menu">
				<button onclick={createRoom} disabled={creating}>
					{creating ? 'Creating…' : 'Create League'}
				</button>
				{#if errorMsg}
					<p class="error">{errorMsg}</p>
				{/if}
				<div class="join-row horiz">
					<input type="text" placeholder="Room code" maxlength={4} bind:value={joinCode} onkeydown={handleJoinKey} />
					<button onclick={joinRoom} style="margin-top: 0;">Join League</button>
				</div>
			</div>
		</div>

		<div class="right-col">
			<h2>How to play</h2>
			<div class="how-to-play top-level-menu">
				<p>You run a team in a league of up to 16, against your friends and some bots. Every season:</p>
				<ol>
					<li><b>Offseason.</b> Decide which fighters to re-sign as their contracts run out, and which worn-out equipment to repair.</li>
					<li><b>Free agency.</b> Sign new fighters. Prices drop each day, but someone else might grab them first.</li>
					<li><b>Training camp.</b> Buy equipment, and have each fighter train a stat or attune to a piece of equipment.</li>
					<li><b>Regular season.</b> Each week, choose who wears what, then watch your whole team brawl another team's.</li>
					<li><b>Playoffs.</b> The best teams play for the title.</li>
				</ol>
				<p>Fighters fight on their own. Your job is to put them in a position to succeed.</p>
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
		gap: 0.25rem;
		align-items: stretch;
	}

	ol {
		margin: 0.25rem 0;
		padding-left: 1.5rem;
	}

	li {
		margin-bottom: 0.4rem;
	}

	b {
		font-weight: 600;
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
