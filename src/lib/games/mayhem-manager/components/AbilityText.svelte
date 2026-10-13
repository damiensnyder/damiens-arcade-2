<script lang="ts">
	import { ABILITIES } from '../catalog.js';

	let { ability, small = false }: { ability: string; small?: boolean } = $props();
	const info = $derived(ABILITIES[ability]);
</script>

{#if info?.description}<p class:small>{info.description}</p>{/if}
