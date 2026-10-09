<script lang="ts">
	// An equipment name that shows what it does on hover.
	import { EQUIPMENT, equipmentIcon, slotsToString } from '../catalog.js';
	import Hover from './Hover.svelte';

	let { itemKey }: { itemKey: string } = $props();
	const info = $derived(EQUIPMENT[itemKey]);
</script>

<Hover>
	{info?.name ?? itemKey}
	{#snippet card()}
		<div class="row between">
			<h3>{info?.name ?? itemKey}</h3>
			<span class="muted small">{info ? slotsToString(info.slots) : ''}</span>
		</div>
		<div class="row" style="align-items: flex-start">
			<img src={equipmentIcon(itemKey)} alt="" width="64" height="64" />
			<div style="display: flex; flex-direction: column; gap: 0.3rem; flex: 1">
				<p class="small">{info?.description}</p>
				{#if info?.flavor}<p class="small muted" style="font-style: italic">{info.flavor}</p>{/if}
			</div>
		</div>
	{/snippet}
</Hover>
