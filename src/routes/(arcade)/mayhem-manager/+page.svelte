<script lang="ts">
	import ArcadeHeader from '$lib/components/ArcadeHeader.svelte';
</script>

<svelte:head>
	<title>Mayhem Manager — Damien's Arcade</title>
</svelte:head>

<div class="page">
	<ArcadeHeader href="/" title="Damien's Arcade" />

	<div class="content">
		<h2>Mayhem Manager</h2>
		<div class="top-level-menu">
			<p>
				Under construction. Mayhem Manager hasn't been ported over from the old version of the
				arcade site yet.
			</p>
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
</style>
