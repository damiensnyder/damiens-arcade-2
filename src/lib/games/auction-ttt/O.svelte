<script lang="ts">
	let { size = 100 }: { size?: number } = $props();
	const strokeWidth = 200 / size;
</script>

<svg width={size} height={size} viewBox="0 0 100 100">
	<circle cx="50" cy="50" r="30" fill="none" stroke="#6df" stroke-width={strokeWidth} />
</svg>
