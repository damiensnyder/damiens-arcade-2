<script lang="ts">
	// 0–10 stat shown as five stars; each star is two points. Points gained since `previous`
	// (or to be gained, with `preview`) are drawn in red.
	let { value, previous = null, preview = null, size = 16 }: { value: number; previous?: number | null; preview?: number | null; size?: number } = $props();

	const STAR = 'M5 7.457 L8.09 9.51 L7.092 5.937 L10 3.632 L6.293 3.477 L5 0 L3.707 3.477 L0 3.632 L2.908 5.937 L1.91 9.51 L5 7.457 Z';
	const fill = (v: number, n: number) => (v > n ? '100%' : v === n ? '50%' : '0%');
	// red layer underneath shows the larger value, gold on top shows the older one
	const high = $derived(Math.round(Math.max(value, preview ?? value)));
	const low = $derived(Math.round(preview !== null ? value : previous !== null ? Math.min(previous, value) : value));
	const stars = $derived([1, 3, 5, 7, 9].map((n) => ({ red: fill(high, n), gold: fill(low, n) })));
</script>

<span class="stars" role="img" aria-label="{Math.round(value)} out of 10">
	{#each stars as s, i (i)}
		<span class="star" style:width="{size}px" style:height="{size}px">
			<svg viewBox="0 0 10 10" width={size} height={size} aria-hidden="true"><path fill="#808080" d={STAR} /></svg>
			<span class="fill" style:width={s.red} style:height="{size}px"
				><svg viewBox="0 0 10 10" width={size} height={size} aria-hidden="true"><path fill="#e66" d={STAR} /></svg></span
			>
			<span class="fill" style:width={s.gold} style:height="{size}px"
				><svg viewBox="0 0 10 10" width={size} height={size} aria-hidden="true"><path fill="#ec6" d={STAR} /></svg></span
			>
		</span>
	{/each}
</span>

<style>
	.stars {
		display: inline-flex;
		gap: 2px;
	}

	.star {
		position: relative;
		display: inline-block;
	}

	svg {
		position: absolute;
		left: 0;
		top: 0;
	}

	.fill {
		position: absolute;
		left: 0;
		top: 0;
		overflow: hidden;
	}
</style>
