<script lang="ts">
	import { getContext } from 'svelte';
	import type { RoomState } from '$lib/games/room.svelte.js';
	import type { AuctionTTTState } from './state.svelte.js';

	const room = getContext<RoomState>('room');
	const game = getContext<AuctionTTTState>('game');

	const isHost = $derived(room.pov === room.host);

	let localMoney = $state(game.settings.startingMoney);
	let localTiebreaker = $state(game.settings.useTiebreaker);

	// Track whether local values came from a remote sync (to avoid re-sending)
	let syncingFromRemote = false;

	// Keep local form state in sync when settings change remotely
	$effect(() => {
		syncingFromRemote = true;
		localMoney = game.settings.startingMoney;
		localTiebreaker = game.settings.useTiebreaker;
		// Reset flag after microtask so our change handlers don't fire
		Promise.resolve().then(() => { syncingFromRemote = false; });
	});

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	function onMoneyChange() {
		if (syncingFromRemote) return;
		if (debounceTimer !== null) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			room.sendAction({
				type: 'changeSettings',
				settings: { startingMoney: localMoney, useTiebreaker: localTiebreaker }
			});
		}, 400);
	}

	function onTiebreakerChange() {
		if (syncingFromRemote) return;
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		room.sendAction({
			type: 'changeSettings',
			settings: { startingMoney: localMoney, useTiebreaker: localTiebreaker }
		});
	}
</script>

<div class="settings-editor top-level-menu">
	<h3>Game Settings</h3>
	<div class="form-field">
		<label for="startingMoney">Starting money:</label>
		<input
			id="startingMoney"
			type="number"
			min={0}
			disabled={!isHost}
			bind:value={localMoney}
			oninput={onMoneyChange}
		/>
	</div>
	<div class="form-field">
		<label for="useTiebreaker">Use time as tiebreaker:</label>
		<input
			id="useTiebreaker"
			type="checkbox"
			disabled={!isHost}
			bind:checked={localTiebreaker}
			onchange={onTiebreakerChange}
		/>
	</div>
</div>

<style>
	.settings-editor {
		min-width: 18rem;
	}

	.form-field {
		margin: 0.25rem 0;
	}

	input[type='number'] {
		flex: 0 0 auto;
		width: 4rem;
		margin-right: 0;
	}
</style>
