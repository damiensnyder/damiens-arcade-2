<script lang="ts">
	import { setContext } from 'svelte';
	import { RoomState } from '$lib/games/room.svelte.js';
	import { MMState } from '$lib/games/mayhem-manager/state.svelte.js';
	import type { MMViewpointWire } from '$lib/games/mayhem-manager/types.js';
	import Game from '$lib/games/mayhem-manager/Game.svelte';

	let { data } = $props();

	const room = new RoomState();
	const mm = new MMState(data.roomCode, (action) => room.sendAction(action));

	setContext('room', room);
	setContext('mm', mm);

	$effect(() => {
		room.connect(data.roomCode);
		const unsubGamestate = room.onGamestate((state) => mm.applyGamestate(state as MMViewpointWire));
		const unsubEvent = room.onEvent((event) => mm.handleEvent(event as { type: string }));
		return () => {
			unsubGamestate();
			unsubEvent();
			room.disconnect();
		};
	});
</script>

<svelte:head>
	<title>Mayhem Manager</title>
</svelte:head>

<Game />
