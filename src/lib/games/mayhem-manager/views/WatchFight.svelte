<script lang="ts">
	import { getContext } from 'svelte';
	import FighterSprite from '../components/FighterSprite.svelte';
	import TeamLogo from '../components/TeamLogo.svelte';
	import { awayKit, kitFor, spriteLayers, type Kit } from '../appearance.js';
	import { EQUIPMENT } from '../catalog.js';
	import { Replay, TICK_SECONDS, type Frame } from '../replay.js';
	import type { MMState } from '../state.svelte.js';
	import { TEAMS, teamShortName } from '../teams.js';
	import type { FightLog, FighterVisual, Tint } from '../types.js';

	let { log }: { log: FightLog } = $props();
	const mm = getContext<MMState>('mm');
	const match = $derived(mm.vp?.matches.find((m) => m.id === log.matchId));

	// The arena shows from VIEW_MIN to VIEW_MAX meters on each axis (the fight happens in 0–100).
	const VIEW_MIN = -10;
	const VIEW_SIZE = 120;
	const SPRITE_METERS = 15;
	const pct = (meters: number) => ((meters - VIEW_MIN) / VIEW_SIZE) * 100;

	const replay = new Replay(log.ticks);
	let frame = $state<Frame>({ fighters: [], particles: [] });
	let tick = $state(-1);
	let paused = $state(false);
	let speed = $state(2);
	let finished = $state(false);
	let delta = 0;

	// the camera zooms in to fit everyone still standing, like a broadcast would
	let camera = $state({ scale: 1, x: 50, y: 50 });
	const CAMERA_BUFFER = 15; // meters around the outermost fighters

	function updateCamera(dt: number) {
		const standing = frame.fighters.filter((f) => f.hp > 0);
		let target = { scale: 1, x: 50, y: 50 };
		if (standing.length > 0) {
			const xs = standing.map((f) => pct(f.x));
			const ys = standing.map((f) => pct(f.y));
			const buffer = (CAMERA_BUFFER / VIEW_SIZE) * 100;
			const width = Math.max(...xs) - Math.min(...xs) + 2 * buffer;
			const height = Math.max(...ys) - Math.min(...ys) + 2 * buffer;
			const scale = Math.max(1, Math.min(2.2, 100 / Math.max(width, height)));
			// keep the view inside the arena
			const half = 50 / scale;
			const clamp = (v: number) => Math.max(half, Math.min(100 - half, v));
			target = { scale, x: clamp((Math.max(...xs) + Math.min(...xs)) / 2), y: clamp((Math.max(...ys) + Math.min(...ys)) / 2) };
		}
		const k = Math.min(1, 1.5 * dt);
		camera = {
			scale: camera.scale + (target.scale - camera.scale) * k,
			x: camera.x + (target.x - camera.x) * k,
			y: camera.y + (target.y - camera.y) * k
		};
	}

	function markFinished() {
		if (!finished) {
			finished = true;
			mm.reveal(log.matchId);
		}
	}

	$effect(() => {
		let last = performance.now();
		let raf = 0;
		const loop = (now: number) => {
			const dt = Math.min((now - last) / 1000, 0.25);
			last = now;
			if (!paused && !replay.done) {
				delta += (dt * speed) / TICK_SECONDS;
				while (delta >= 1 && !replay.done) {
					replay.step();
					delta -= 1;
				}
				if (replay.done) {
					delta = 0;
					markFinished();
				}
				frame = replay.frame(Math.min(delta, 1));
				tick = replay.tick;
			}
			updateCamera(paused ? 0 : dt);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});

	function restart() {
		replay.seek(-1);
		finished = false;
		delta = 0;
		paused = false;
		frame = replay.frame(0);
		tick = -1;
	}

	function seekTo(target: number) {
		replay.seek(Math.max(0, Math.min(target, replay.length - 1)));
		delta = 0;
		frame = replay.frame(0);
		tick = replay.tick;
		if (replay.done) markFinished();
	}

	function onProgressClick(e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		seekTo(Math.round(((e.clientX - rect.left) / rect.width) * (replay.length - 1)));
	}

	function onProgressKey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') seekTo(tick + 25);
		else if (e.key === 'ArrowLeft') seekTo(tick - 25);
	}

	const teams = $derived(match ? [match.a, match.b] : [...new Set(frame.fighters.map((f) => f.team))]);
	const kits = $derived(
		new Map<number, Kit>(teams.map((t, i) => [t, i === 1 && teams.length === 2 ? awayKit(teams[0], t) : kitFor(t)]))
	);
	const alive = (team: number) => frame.fighters.filter((f) => f.team === team && f.hp > 0).length;
	const clock = $derived.by(() => {
		const secs = Math.max(0, Math.floor(Math.max(tick, 0) * TICK_SECONDS));
		return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
	});

	function tintFilter(tint: Tint, flash: number): string {
		const parts: string[] = [];
		if (flash > 0) parts.push(`brightness(${1 + flash})`);
		const a = tint[3];
		if (a > 0) {
			const hue = (Math.atan2(Math.sqrt(3) * (tint[1] - tint[2]), 2 * tint[0] - tint[1] - tint[2]) * 180) / Math.PI;
			parts.push(`sepia(${Math.min(1, a * 2)}) hue-rotate(${hue - 40}deg) saturate(${1 + a * 3})`);
		}
		return parts.join(' ') || 'none';
	}

	function gearText(f: FighterVisual): string {
		return f.equipment.length ? f.equipment.map((k) => EQUIPMENT[k]?.name ?? k).join(', ') : 'no equipment';
	}

	const winnerText = $derived.by(() => {
		if (!match?.result) return '';
		const w = match.result.winner;
		const standing = w === match.a ? match.result.standingA : match.result.standingB;
		return `The ${TEAMS[w].last} win with ${standing} fighter${standing === 1 ? '' : 's'} standing!`;
	});
</script>

<main class="panel watch">
	<section class="col stage">
		<div class="scoreline">
			<button type="button" onclick={() => (mm.watching = null)}>back</button>
			{#each teams as t, i (t)}
				{#if i === 1}<span class="clock">{clock}</span>{/if}
				<span class="score" class:right={i === 1}>
					<TeamLogo team={t} />
					<span class:own={t === mm.vp?.myTeam}>{teamShortName(t)}</span>
					<span class="alive">{alive(t)} standing</span>
				</span>
			{/each}
		</div>

		<div class="arena" role="img" aria-label="Fight replay: {teams.map((t) => teamShortName(t)).join(' vs ')}">
			<div class="world" style:transform="translate({50 - camera.scale * camera.x}%, {50 - camera.scale * camera.y}%) scale({camera.scale})">
			<img class="bg" src="/mm/arena.png" alt="" draggable="false" />
			{#each frame.fighters as f, i (i)}
				{#if f.hp > 0}
					<div class="fighter" style:left="{pct(f.x)}%" style:top="{pct(f.y)}%" style:z-index={Math.round(f.y * 10)}>
						<div class="body" style:transform="rotate({f.rotation}deg) scaleX({f.facing})" style:filter={tintFilter(f.tint, f.flash)}>
							{#each spriteLayers(f.look, kits.get(f.team) ?? kitFor(f.team), f.equipment) as layer, j (j)}
								<img src={layer.src} alt="" style:filter={layer.filter} style:transform={layer.flip ? 'scaleX(-1)' : undefined} draggable="false" />
							{/each}
							{#each frame.particles as p, k (k)}
								{#if p.type === 'overlay' && p.fighter === i}<img src={p.img} alt="" style:opacity={p.opacity} draggable="false" />{/if}
							{/each}
						</div>
						<span class="hp"><span style:width="{Math.max(f.hp, 0)}%" style:background={f.team === mm.vp?.myTeam ? '#eeb' : '#e99'}></span></span>
					</div>
				{/if}
			{/each}
			{#each frame.particles as p, k (k)}
				{#if p.type === 'projectile'}
					<img class="fx" src={p.img} alt="" style:left="{pct(p.x)}%" style:top="{pct(p.y)}%" style:transform="translate(-50%, -50%) rotate({p.rotation - 90}deg)" draggable="false" />
				{:else if p.type === 'text'}
					<span class="float" style:left="{pct(p.x)}%" style:top="{pct(p.y)}%" style:opacity={p.opacity} style:color={p.color}>{p.text}</span>
				{/if}
			{/each}
			</div>
			{#if finished && winnerText}
				<div class="result-banner">{winnerText}</div>
			{/if}
		</div>

		<div class="controls">
			<button type="button" onclick={() => (paused = !paused)} disabled={finished && replay.done}>{paused ? 'play' : 'pause'}</button>
			<button type="button" onclick={restart}>restart</button>
			<div
				class="progress"
				role="slider"
				tabindex="0"
				aria-label="Fight progress"
				aria-valuemin={0}
				aria-valuemax={replay.length - 1}
				aria-valuenow={Math.max(tick, 0)}
				onclick={onProgressClick}
				onkeydown={onProgressKey}
			>
				<span style:width="{(Math.max(tick, 0) / Math.max(replay.length - 1, 1)) * 100}%"></span>
			</div>
			<div class="speed" role="group" aria-label="Playback speed">
				{#each [1, 2, 4] as s (s)}
					<button type="button" class="mini" class:on={speed === s} onclick={() => (speed = s)}>{s}x</button>
				{/each}
			</div>
			<button type="button" onclick={() => seekTo(replay.length - 1)}>skip to result</button>
		</div>
	</section>

	<aside class="col side">
		{#each teams as t (t)}
			<div class="card">
				<div class="row">
					<TeamLogo team={t} />
					<h3 class:own={t === mm.vp?.myTeam}>{TEAMS[t].last}</h3>
				</div>
				{#each frame.fighters.filter((f) => f.team === t) as f (f.fighterId)}
					<div class="mate" class:down={f.hp <= 0}>
						<span class="mini-sprite"><FighterSprite look={f.look} team={f.team} kit={kits.get(f.team) ?? null} equipment={f.equipment} size={44} /></span>
						<div class="mate-text">
							<div class="row between">
								<span class="small">{f.name}</span>
								<span class="muted small">{f.hp > 0 ? `${f.hp} / 100` : 'down'}</span>
							</div>
							<div class="bar"><span style:width="{Math.max(f.hp, 0)}%" style:background={t === mm.vp?.myTeam ? '#eeb' : '#e99'}></span></div>
							<span class="muted small">{gearText(f)}</span>
						</div>
					</div>
				{/each}
			</div>
		{/each}
	</aside>
</main>

<style>
	.stage {
		flex: 3 1 560px;
	}

	.side {
		flex: 1 1 300px;
	}

	.scoreline {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		flex-wrap: wrap;
	}

	.score {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.alive {
		font-size: 0.9rem;
		color: #aaa;
	}

	.clock {
		font-size: 1.4rem;
		font-weight: 700;
	}

	.arena {
		position: relative;
		width: 100%;
		max-width: min(100%, 72vh);
		aspect-ratio: 1;
		margin: 0 auto;
		border-radius: 2rem;
		border: 2px solid #111;
		background: #111;
		overflow: hidden;
	}

	.world {
		position: absolute;
		inset: 0;
		transform-origin: 0 0;
	}

	.bg {
		position: absolute;
		/* the arena image spans -25 to 125 meters */
		left: -12.5%;
		top: -12.5%;
		width: 125%;
		height: 125%;
		user-select: none;
	}

	.fighter {
		position: absolute;
		width: 12.5%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.body {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
	}

	.body img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		user-select: none;
	}

	.hp {
		width: 60%;
		height: 5px;
		border-radius: 3px;
		background: #311;
		overflow: hidden;
		border: 1px solid #111;
		margin-top: -8%;
	}

	.hp > span,
	.bar > span {
		display: block;
		height: 100%;
	}

	.fx {
		position: absolute;
		width: 12.5%;
		pointer-events: none;
		z-index: 2000;
	}

	.float {
		position: absolute;
		font-size: 1rem;
		font-weight: 700;
		text-shadow: 0 1px 2px #000;
		transform: translate(-50%, -50%);
		pointer-events: none;
		z-index: 2001;
		white-space: nowrap;
	}

	.result-banner {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 3000;
		background: #521e;
		border: 2px solid #eeb;
		border-radius: 1rem;
		padding: 0.75rem 1.25rem;
		color: #eeb;
		font-size: 1.2rem;
		text-align: center;
		max-width: 80%;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}

	.progress {
		flex: 1 1 12rem;
		height: 12px;
		border-radius: 6px;
		background: #311;
		border: 2px solid #755;
		overflow: hidden;
		cursor: pointer;
	}

	.progress > span {
		display: block;
		height: 100%;
		background: #eeb;
	}

	.speed {
		display: inline-flex;
		gap: 0.25rem;
	}

	.mate {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr);
		gap: 0.6rem;
		align-items: center;
	}

	.mate.down {
		opacity: 0.45;
	}

	.mini-sprite {
		margin-top: -0.4rem;
		display: inline-flex;
	}

	.mate-text {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.bar {
		height: 8px;
		border-radius: 4px;
		background: #311;
		border: 1px solid #755;
		overflow: hidden;
	}

	@media (max-width: 720px) {
		.arena {
			border-radius: 1rem;
		}

		.float {
			font-size: 0.8rem;
		}
	}
</style>
