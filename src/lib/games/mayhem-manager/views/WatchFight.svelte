<script lang="ts">
	import { getContext } from 'svelte';
	import FighterSprite from '../components/FighterSprite.svelte';
	import TeamLogo from '../components/TeamLogo.svelte';
	import { awayKit, kitFor, spriteLayers, type Kit } from '../appearance.js';
	import { EQUIPMENT } from '../catalog.js';
	import { Replay, TICK_SECONDS, type FighterFx, type Frame, type Particle } from '../replay.js';
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
	let frame = $state<Frame>({ fighters: [], fx: [], particles: [], money: new Map() });
	let tick = $state(-1);
	let paused = $state(false);
	let speed = $state(1);
	let finished = $state(false);
	let delta = 0;

	// the camera zooms in to fit everyone still standing, like a broadcast would, and cuts in on knockouts
	let camera = $state({ scale: 1, x: 50, y: 50 });
	const CAMERA_BUFFER = 15; // meters around the outermost fighters
	const KO_CAMERA_BUFFER = 9;
	const KO_CAMERA_TICKS = 4;

	function updateCamera(dt: number) {
		const ko = knockoutAt(replay.tick + delta);
		const standing = frame.fighters.filter((f) => f.hp > 0);
		const fallen = ko ? ko.fighters.map((i) => frame.fighters[i]).filter(Boolean) : [];
		// the knockout that ends the fight shows the winners too
		const shown = !ko ? standing : ko.tick === replay.finalKnockout ? [...fallen, ...standing] : fallen;
		const focus = ko !== null;
		let target = { scale: 1, x: 50, y: 50 };
		if (shown.length > 0) {
			const xs = shown.map((f) => pct(f.x));
			const ys = shown.map((f) => pct(f.y));
			const buffer = ((focus ? KO_CAMERA_BUFFER : CAMERA_BUFFER) / VIEW_SIZE) * 100;
			const width = Math.max(...xs) - Math.min(...xs) + 2 * buffer;
			const height = Math.max(...ys) - Math.min(...ys) + 2 * buffer;
			const scale = Math.max(1, Math.min(focus ? 2.6 : 2.2, 100 / Math.max(width, height)));
			// keep the view inside the arena
			const half = 50 / scale;
			const clamp = (v: number) => Math.max(half, Math.min(100 - half, v));
			target = { scale, x: clamp((Math.max(...xs) + Math.min(...xs)) / 2), y: clamp((Math.max(...ys) + Math.min(...ys)) / 2) };
		}
		const k = Math.min(1, (focus ? 5 : 1.5) * dt);
		camera = {
			scale: camera.scale + (target.scale - camera.scale) * k,
			x: camera.x + (target.x - camera.x) * k,
			y: camera.y + (target.y - camera.y) * k
		};
	}

	/** The knockout that just happened, while the camera should be on it. */
	function knockoutAt(t: number): Replay['knockouts'][number] | null {
		return replay.knockouts.find((ko) => t >= ko.tick && t < ko.tick + KO_CAMERA_TICKS) ?? null;
	}

	// slow motion for a moment at every knockout, and building up to the one that ends the fight
	const SLOW = 0.4;
	const KO_SLOW_TICKS = 3;
	/** Ticks at full slow motion before speeding back up. */
	const KO_SLOW_HOLD = 1;
	const BUILDUP_TICKS = 7;

	function slowdown(t: number): number {
		let factor = 1;
		const final = replay.finalKnockout;
		if (final !== null && t >= final - BUILDUP_TICKS && t < final) {
			factor = 1 - (1 - SLOW) * smooth((t - (final - BUILDUP_TICKS)) / BUILDUP_TICKS);
		}
		for (const ko of replay.knockouts) {
			const since = t - ko.tick;
			if (since < 0 || since >= KO_SLOW_TICKS) continue;
			factor = Math.min(factor, since < KO_SLOW_HOLD ? SLOW : SLOW + (1 - SLOW) * smooth((since - KO_SLOW_HOLD) / (KO_SLOW_TICKS - KO_SLOW_HOLD)));
		}
		return factor;
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
				delta += (dt * speed * slowdown(replay.tick + delta)) / TICK_SECONDS;
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

	function togglePause() {
		if (!(finished && replay.done)) paused = !paused;
	}

	const SKIP_TICKS = 25;

	function onProgressKey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') seekTo(tick + SKIP_TICKS);
		else if (e.key === 'ArrowLeft') seekTo(tick - SKIP_TICKS);
		else return;
		e.preventDefault();
	}

	/** Space pauses, the arrows skip 5 seconds, and 1, 2 and 4 set the speed. */
	function onKey(e: KeyboardEvent) {
		if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
		if (e.key === ' ') togglePause();
		else if (e.key === 'ArrowRight') seekTo(tick + SKIP_TICKS);
		else if (e.key === 'ArrowLeft') seekTo(tick - SKIP_TICKS);
		else if (e.key === '1' || e.key === '2' || e.key === '4') speed = Number(e.key);
		else return;
		e.preventDefault();
	}

	// a focused button would also be clicked by the space bar when it comes back up
	function onKeyUp(e: KeyboardEvent) {
		if (e.key === ' ' && e.target instanceof Element && e.target.closest('button')) e.preventDefault();
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

	function fighterFilter(f: FighterVisual, fx: FighterFx | undefined): string {
		const filter = tintFilter(f.tint, f.flash);
		const down = fx?.down ?? 0;
		if (down === 0) return filter;
		return `${filter === 'none' ? '' : filter + ' '}grayscale(${down}) brightness(${1 - 0.2 * down})`;
	}

	/** Knocked-out fighters fall over backward, with a little bounce when they land. */
	function bodyTransform(f: FighterVisual, fx: FighterFx | undefined): string {
		const down = fx?.down ?? 0;
		const facing = `scaleX(${f.facing})`;
		if (down > 0) {
			const fall = down < 0.8 ? (down / 0.8) ** 2 : 1 - 0.08 * Math.sin(((down - 0.8) / 0.2) * Math.PI);
			const angle = f.rotation + (90 * (Math.sign(f.facing) || 1) - f.rotation) * fall;
			return `rotate(${angle}deg) ${facing}`;
		}
		return `translateY(${-2 * (fx?.hop ?? 0)}%) rotate(${f.rotation}deg) ${facing}`;
	}

	function shadowTransform(f: FighterVisual, fx: FighterFx | undefined): string {
		const down = fx?.down ?? 0;
		// a fallen fighter's shadow stretches out under them
		const shift = 95 * down * (Math.sign(f.facing) || 1);
		const shrink = 1 - 0.06 * (fx?.hop ?? 0);
		return `translateX(calc(-50% + ${shift}%)) scale(${shrink * (1 + 1.1 * down)}, ${shrink})`;
	}

	const smooth = (t: number) => t * t * (3 - 2 * t);
	const easeOut = (t: number) => 1 - (1 - t) ** 2;

	/** A jagged star, for where hits land. */
	const STAR = Array.from({ length: 16 }, (_, i) => {
		const r = i % 2 === 1 ? 0.42 : i % 4 === 0 ? 1 : 0.78;
		const a = (i / 16) * 2 * Math.PI;
		return `${(r * Math.cos(a)).toFixed(3)},${(r * Math.sin(a)).toFixed(3)}`;
	}).join(' ');

	/** Money rises off the fighter, then flies to their team's corner of the scoreboard. */
	function moneyPosition(p: Extract<Particle, { type: 'money' }>): { x: number; y: number; opacity: number; scale: number } {
		const x = 50 + camera.scale * (pct(p.x) - camera.x);
		const y = 50 + camera.scale * (pct(p.y) - camera.y);
		const RISE = 0.35;
		if (p.progress < RISE) {
			const k = p.progress / RISE;
			return { x, y: y - 5 * easeOut(k), opacity: Math.min(1, 3 * k), scale: 1 };
		}
		const k = smooth((p.progress - RISE) / (1 - RISE));
		const destX = teams.indexOf(p.team) === 1 ? 90 : 10;
		return { x: x + (destX - x) * k, y: y - 5 + (3 - (y - 5)) * k, opacity: 1, scale: 1 - 0.3 * k };
	}

	function moneyText(amount: number): string {
		return amount < 0 ? `−$${-amount}` : `+$${amount}`;
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

	const dismissText = $derived.by(() => {
		const mine = mm.vp?.myTeam;
		if (!match?.result || mine == null || (match.a !== mine && match.b !== mine)) return 'got it';
		return match.result.winner === mine ? 'yay' : 'dang';
	});
</script>

<svelte:window onkeydown={onKey} onkeyup={onKeyUp} />

{#snippet hpBar(cls: string, hp: number, lost: FighterFx['lost'], color: string)}
	<span class={cls}>
		<span class="fill" style:width="{Math.max(hp, 0)}%" style:background={color}></span>
		{#each lost as l, k (k)}
			<span class="lost" style:left="{l.lo}%" style:width="{l.hi - l.lo}%" style:opacity={l.opacity}></span>
		{/each}
	</span>
{/snippet}

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
					{#if frame.money.get(t)}
						{@const change = frame.money.get(t) ?? 0}
						{#key change}<span class="money" class:lost-money={change < 0}>{moneyText(change)}</span>{/key}
					{/if}
				</span>
			{/each}
		</div>

		<div class="arena" role="img" aria-label="Fight replay: {teams.map((t) => teamShortName(t)).join(' vs ')}">
			<div class="world" style:transform="translate({50 - camera.scale * camera.x}%, {50 - camera.scale * camera.y}%) scale({camera.scale})">
			<img class="bg" src="/mm/arena.png" alt="" draggable="false" />
			{#each frame.fighters as f, i (i)}
				{@const fx = frame.fx[i]}
				{@const down = f.hp <= 0}
				<!-- the fallen stay where they fell, under everyone still fighting -->
				<div class="fighter" style:left="{pct(f.x)}%" style:top="{pct(f.y)}%" style:z-index={down ? Math.round(f.y) : 1000 + Math.round(f.y * 10)}>
					<span class="shadow" style:transform={shadowTransform(f, fx)}></span>
					<div class="body" class:down style:transform={bodyTransform(f, fx)} style:filter={fighterFilter(f, fx)}>
						{#each spriteLayers(f.look, kits.get(f.team) ?? kitFor(f.team), f.equipment) as layer, j (j)}
							<img src={layer.src} alt="" style:filter={layer.filter} style:transform={layer.flip ? 'scaleX(-1)' : undefined} draggable="false" />
						{/each}
						{#each frame.particles as p, k (k)}
							{#if p.type === 'overlay' && p.fighter === i}<img src={p.img} alt="" style:opacity={p.opacity} draggable="false" />{/if}
						{/each}
					</div>
					{#if !down}{@render hpBar('hp', f.hp, fx?.lost ?? [], f.team === mm.vp?.myTeam ? '#eeb' : '#e99')}{/if}
				</div>
			{/each}
			{#each frame.particles as p, k (k)}
				{#if p.type === 'projectile'}
					<img class="fx" src={p.img} alt="" style:left="{pct(p.x)}%" style:top="{pct(p.y)}%" style:transform="translate(-50%, -50%) rotate({p.rotation - 90}deg)" draggable="false" />
				{:else if p.type === 'text'}
					<span class="float" style:left="{pct(p.x)}%" style:top="{pct(p.y)}%" style:opacity={p.opacity} style:color={p.color}>{p.text}</span>
				{:else if p.type === 'burst'}
					<svg
						class="burst"
						viewBox="-1.1 -1.1 2.2 2.2"
						style:left="{pct(p.x)}%"
						style:top="{pct(p.y)}%"
						style:width="{4 * p.size}%"
						style:opacity={1 - p.progress ** 2}
						style:transform="translate(-50%, -50%) rotate({p.spin}deg) scale({0.5 + 0.7 * easeOut(p.progress)})"
					>
						<polygon points={STAR} fill="#fff6b0" stroke="#2a1d14" stroke-width="0.1" stroke-linejoin="round" />
					</svg>
				{/if}
			{/each}
			</div>
			{#each frame.particles as p, k (k)}
				{#if p.type === 'money'}
					{@const at = moneyPosition(p)}
					<span class="flying-money" style:left="{at.x}%" style:top="{at.y}%" style:opacity={at.opacity} style:transform="translate(-50%, -50%) scale({at.scale})">{moneyText(p.amount)}</span>
				{/if}
			{/each}
			<!-- only at the end: scrubbing back hides it until playback gets there again -->
			{#if finished && tick >= replay.length - 1 && winnerText}
				<div class="result-banner">
					<p>{winnerText}</p>
					<button type="button" class="go" onclick={() => (mm.watching = null)}>{dismissText}</button>
				</div>
			{/if}
		</div>

		<div class="controls">
			<button type="button" onclick={togglePause} disabled={finished && replay.done}>{paused ? 'play' : 'pause'}</button>
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
				{#each frame.fighters as f, i (f.fighterId)}
					{#if f.team === t}
					<div class="mate" class:down={f.hp <= 0}>
						<span class="mini-sprite"><FighterSprite look={f.look} team={f.team} kit={kits.get(f.team) ?? null} equipment={f.equipment} size={44} /></span>
						<div class="mate-text">
							<div class="row between">
								<span class="small">{f.name}</span>
								<span class="muted small">{f.hp > 0 ? `${f.hp} / 100` : 'down'}</span>
							</div>
							{@render hpBar('bar', f.hp, frame.fx[i]?.lost ?? [], t === mm.vp?.myTeam ? '#eeb' : '#e99')}
							<span class="muted small">{gearText(f)}</span>
						</div>
					</div>
					{/if}
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

	/* fall over around the feet */
	.body.down {
		transform-origin: 50% 92%;
	}

	.shadow {
		position: absolute;
		left: 50%;
		width: 44%;
		aspect-ratio: 4;
		/* centered under the feet, 92% of the way down the sprite (margins are a share of the width) */
		margin-top: 86.5%;
		border-radius: 50%;
		background: radial-gradient(closest-side, #0005, #0000);
		pointer-events: none;
	}

	.body img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		user-select: none;
	}

	.hp {
		position: relative;
		width: 60%;
		height: 5px;
		border-radius: 3px;
		background: #311;
		overflow: hidden;
		border: 1px solid #111;
		margin-top: -8%;
	}

	.fill {
		display: block;
		height: 100%;
	}

	/* health just lost */
	.lost {
		position: absolute;
		top: 0;
		bottom: 0;
		background: #e11;
	}

	.fx {
		position: absolute;
		width: 12.5%;
		pointer-events: none;
		z-index: 3000;
	}

	.burst {
		position: absolute;
		pointer-events: none;
		z-index: 3000;
		overflow: visible;
	}

	.float {
		position: absolute;
		font-size: 1rem;
		font-weight: 700;
		text-shadow: 0 1px 2px #000;
		transform: translate(-50%, -50%);
		pointer-events: none;
		z-index: 3001;
		white-space: nowrap;
	}

	.flying-money {
		position: absolute;
		z-index: 2900;
		font-size: 1.1rem;
		font-weight: 700;
		color: #eeb;
		text-shadow: 0 1px 2px #000;
		pointer-events: none;
		white-space: nowrap;
	}

	.money {
		font-weight: 700;
		color: #eeb;
		animation: money-pop 0.4s ease-out;
	}

	.money.lost-money {
		color: #e99;
	}

	@keyframes money-pop {
		from {
			transform: scale(1.5);
		}
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
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
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
		position: relative;
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
