<script lang="ts">
</script>

<svelte:head>
	<title>Damien's Arcade</title>
</svelte:head>

<div class="page">
	<h1>Damien's Arcade</h1>

	<div class="games">
		<div class="card horiz">
			<img src="/thumbnails/auction-ttt.svg" alt="Auction Tic-Tac-Toe" class="thumbnail" draggable="false" />
			<div class="card-body">
				<div class="card-top horiz">
					<h2>Auction Tic-Tac-Toe</h2>
					<a href="/auction-ttt" class="play-btn">Play Now</a>
				</div>
				<p>Tic-tac-toe, but you and your opponent bid on every square. Doesn't become a draw every time! Supports hot seat and online multiplayer.</p>
			</div>
		</div>

		<div class="card horiz">
			<img src="/thumbnails/daily-qless.svg" alt="Daily Q-less" class="thumbnail" draggable="false" />
			<div class="card-body">
				<div class="card-top horiz">
					<h2>Daily Q-less</h2>
					<a href="/daily-qless" class="play-btn">Play Now</a>
				</div>
				<p>A daily puzzle based on the word game Q-less. Arrange all your tiles into interlocking words. Guaranteed solvable every day.</p>
			</div>
		</div>
	</div>
</div>

<style>
	.page {
		width: 100%;
		min-height: 100vh;
		align-items: center;
		padding: 2rem 3.5rem;
		gap: 2rem;
	}

	.games {
		gap: 1.25rem;
		align-items: stretch;
		max-width: 42rem;
		width: 100%;
	}

	.card {
		padding: 1.25rem 2rem;
		border-radius: 1.5rem;
		border: 2px solid var(--text-1);
		background-color: var(--bg-3);
		gap: 1.5rem;
		align-items: flex-start;
	}

	.card h2 {
		font-size: 1.75rem;
	}

	.thumbnail {
		width: 6rem;
		height: 6rem;
		object-fit: cover;
		border-radius: 0.75rem;
		flex-shrink: 0;
		background-color: var(--bg-1);
	}

	.card-body {
		flex: 1;
		gap: 0.5rem;
		align-items: stretch;
		min-width: 0;
	}

	.card-top {
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.play-btn {
		flex-shrink: 0;
		cursor: pointer;
		padding: 0.25rem 0.75rem 0.1rem;
		border-radius: 0.5rem;
		border: 2px solid var(--text-3);
		font-family: var(--font-subtitle);
		font-size: 1rem;
		color: var(--text-2);
		background-color: var(--accent-2);
		text-decoration: none;
		white-space: nowrap;
		transition:
			color 0.05s ease-in-out,
			background-color 0.05s ease-in-out;
	}

	.play-btn:hover {
		color: var(--text-3);
	}

	.play-btn:active {
		color: var(--text-3);
		background-color: var(--accent-3);
	}

	@media only screen and (max-width: 720px) {
		.page {
			padding: 1.25rem 1rem;
			gap: 1.5rem;
		}

		.card {
			padding: 1rem;
			gap: 1rem;
		}

		.thumbnail {
			width: 5.5rem;
			height: 5.5rem;
		}
	}

	@media only screen and (min-width: 720px) and (max-width: 1200px) {
		.page {
			padding: 1.5rem 1.5rem;
		}
	}
</style>
