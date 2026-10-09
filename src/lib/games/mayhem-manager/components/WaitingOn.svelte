<script lang="ts">
	// "waiting for you, Pandas, and Pickles"
	import { getContext } from 'svelte';
	import type { MMState } from '../state.svelte.js';
	import { teamShortName } from '../teams.js';

	const mm = getContext<MMState>('mm');
	const text = $derived.by(() => {
		const waiting = (mm.vp?.teams ?? []).filter((t) => !t.ready).map((t) => (t.isMine ? 'you' : teamShortName(t.id)));
		if (waiting.length === 0) return 'everyone is ready';
		if (waiting.length > 4) return `waiting for ${waiting.length} teams`;
		const list = waiting.length === 1 ? waiting[0] : waiting.slice(0, -1).join(', ') + (waiting.length > 2 ? ',' : '') + ' and ' + waiting.at(-1);
		return `waiting for ${list}`;
	});
</script>

<span class="muted small">{text}</span>
