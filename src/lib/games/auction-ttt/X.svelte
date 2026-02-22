<script lang="ts">
	let { size = 100 }: { size?: number } = $props();
	const strokeWidth = 200 / size;
</script>

<svg width={size} height={size} viewBox="0 0 100 100">
	<line x1="20" y1="20" x2="80" y2="80" stroke="#f6a" stroke-width={strokeWidth} stroke-linecap="round" />
	<line x1="80" y1="20" x2="20" y2="80" stroke="#f6a" stroke-width={strokeWidth} stroke-linecap="round" />
</svg>
