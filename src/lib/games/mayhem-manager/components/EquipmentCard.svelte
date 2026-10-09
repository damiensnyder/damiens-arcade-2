<script lang="ts">
	import type { Snippet } from 'svelte';
	import { EQUIPMENT, equipmentIcon, slotsToString } from '../catalog.js';

	let {
		itemKey,
		note = '',
		cls = '',
		imgSize = 80,
		actions,
		children
	}: { itemKey: string; note?: string; cls?: string; imgSize?: number; actions?: Snippet; children?: Snippet } = $props();
	const info = $derived(EQUIPMENT[itemKey]);
</script>

<article class="card equipment-card {cls}">
	<div class="row between">
		<h3 class="name">{info?.name ?? itemKey}</h3>
		<span class="muted small">{note || (info ? slotsToString(info.slots) : '')}</span>
	</div>
	<div class="row body">
		<img src={equipmentIcon(itemKey)} alt={info?.name ?? itemKey} width={imgSize} height={imgSize} />
		<div class="text">
			<p class="small">{info?.description}</p>
			{#if children}{@render children()}{/if}
		</div>
	</div>
	{#if actions}
		<div class="row actions">{@render actions()}</div>
	{/if}
</article>

<style>
	.name {
		font-size: 1.05rem !important;
	}

	.body {
		align-items: flex-start !important;
	}

	img {
		flex-shrink: 0;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		flex: 1;
		min-width: 0;
	}

	.actions {
		justify-content: flex-end;
		flex-wrap: wrap;
	}
</style>
