<script lang="ts">
	let { href, title, tag = null }: { href: string; title: string; tag?: string | null } = $props();
</script>

<header>
	<a {href}><h1>{title}</h1></a>
	{#if tag}<span class="tag">{tag}</span>{/if}
</header>

<style>
	header {
		display: flex;
		flex-flow: row;
		position: sticky;
		top: 0;
		background-color: var(--bg-1);
		border-bottom: 1px solid var(--bg-5);
		padding: 0.5rem 1.5rem;
		z-index: 10;
		justify-content: space-between;
		align-items: center;
	}

	a {
		text-decoration: none;
	}

	h1 {
		font-size: 1.5rem;
		margin: 0;
		text-align: left;
	}

	.tag {
		font-family: var(--font-mono);
		color: var(--text-4);
		font-size: 0.9rem;
	}
</style>
