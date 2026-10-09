<script lang="ts">
	let { size = 16, kind = 'bot' }: { size?: number; kind?: 'bot' | 'human' } = $props();
</script>

{#if kind === 'bot'}
	<span class="icon" role="img" aria-label="run by a bot" title="run by a bot"
		><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
			><rect x="4" y="8" width="16" height="12" rx="3"></rect><path d="M12 4v4"></path><circle cx="12" cy="3" r="1"></circle><circle cx="9" cy="14" r="1"></circle><circle cx="15" cy="14" r="1"></circle><path d="M2 13v3M22 13v3"></path></svg
		></span
	>
{:else}
	<span class="icon" role="img" aria-label="taken by a player" title="taken by a player"
		><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
			><circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 4-6 8-6s8 2 8 6"></path></svg
		></span
	>
{/if}

<style>
	.icon {
		color: #aaa;
		display: inline-flex;
		flex-shrink: 0;
	}
</style>
