<script lang="ts">
	import { equipmentIcon } from '../catalog.js';
	import EquipmentName from './EquipmentName.svelte';

	let { items, title = 'Equipment' }: { items: { id: number; key: string; note: string; isNew?: boolean }[]; title?: string } = $props();
</script>

<div class="card">
	<h3>{title}</h3>
	{#if items.length === 0}
		<span class="muted small">no equipment</span>
	{/if}
	{#each items as item (item.id)}
		<div class="row between">
			<span class="row" class:own={item.isNew}>
				<img src={equipmentIcon(item.key)} alt="" width="44" height="44" />
				<EquipmentName itemKey={item.key} />
			</span>
			<span class="muted small">{item.note}</span>
		</div>
	{/each}
</div>

<style>
	img {
		flex-shrink: 0;
	}
</style>
