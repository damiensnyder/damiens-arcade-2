<script lang="ts">
	import { kitFor, spriteLayers, type Kit } from '../appearance.js';
	import type { Look, TeamId } from '../types.js';

	let {
		look,
		team = null,
		equipment = [],
		size = 96,
		facing = 1,
		kit = null
	}: { look: Look; team?: TeamId | null; equipment?: string[]; size?: number; facing?: number; kit?: Kit | null } = $props();

	const layers = $derived(spriteLayers(look, kit ?? kitFor(team), equipment));
</script>

<span class="sprite" style:width="{size}px" style:height="{size}px" style:transform={facing === -1 ? 'scaleX(-1)' : undefined}>
	{#each layers as layer, i (i)}
		<img src={layer.src} alt="" style:filter={layer.filter} style:transform={layer.flip ? 'scaleX(-1)' : undefined} draggable="false" />
	{/each}
</span>

<style>
	.sprite {
		position: relative;
		display: inline-block;
		flex-shrink: 0;
	}

	img {
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 100%;
		user-select: none;
	}
</style>
