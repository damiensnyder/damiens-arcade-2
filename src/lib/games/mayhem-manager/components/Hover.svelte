<script lang="ts">
	// Shows a card next to its trigger on hover or keyboard focus.
	import type { Snippet } from 'svelte';

	let { children, card }: { children: Snippet; card: Snippet } = $props();

	let open = $state(false);
	let trigger: HTMLElement | undefined = $state();
	let left = $state(0);
	let top = $state(0);
	let timer: ReturnType<typeof setTimeout> | null = null;

	function show() {
		if (timer) clearTimeout(timer);
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		const width = 320;
		left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
		top = rect.bottom + 6;
		open = true;
	}

	function hide() {
		timer = setTimeout(() => (open = false), 80);
	}
</script>

<span
	class="trigger"
	bind:this={trigger}
	onmouseenter={show}
	onmouseleave={hide}
	onfocusin={show}
	onfocusout={hide}
	role="button"
	tabindex="0">{@render children()}</span
>
{#if open}
	<div class="pop" role="tooltip" style:left="{left}px" style:top="{top}px" onmouseenter={show} onmouseleave={hide}>
		{@render card()}
	</div>
{/if}

<style>
	.trigger {
		text-decoration: underline dotted;
		text-underline-offset: 3px;
		cursor: default;
	}

	.trigger:hover,
	.trigger:focus-visible {
		color: #eeb;
	}

	.pop {
		position: fixed;
		z-index: 100;
		width: 320px;
		max-width: calc(100vw - 16px);
		background: #521;
		border: 2px solid #aaa;
		border-radius: 1rem;
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		box-shadow: 0 0.5rem 1.5rem #0008;
		font-size: 1rem;
		color: #ddd;
		white-space: normal;
		text-align: left;
	}
</style>
