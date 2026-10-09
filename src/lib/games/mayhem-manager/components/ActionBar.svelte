<script lang="ts">
	// Sticky bar with the page's main action, shown on phones only.
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="actionbar">{@render children()}</div>
