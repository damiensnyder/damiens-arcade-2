// Pits two bot versions against each other in all-bot leagues: half the teams use each. Prints how
// often A beats B when they meet (regular season and playoffs) and each side's share of titles.
//
//   npx tsx scripts/mm-h2h.ts <a.ts> <b.ts> [--leagues 40] [--seasons 10] [--teams 8] [--from 2] [--workers 4]
//
// Each file exports `BOT` (a BotPolicy); "default" means src/server/games/mayhem-manager/bot.ts.
// Seasons before --from are skipped, since the first is unusual.

import { fork } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import MayhemManager from '../src/server/games/mayhem-manager/index.js';
import type { BotPolicy } from '../src/server/games/mayhem-manager/bot.js';
import type { LeagueState } from '../src/server/games/mayhem-manager/state.js';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
	const i = args.indexOf('--' + name);
	return i >= 0 ? Number(args[i + 1]) : fallback;
};
const [pathA, pathB] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const leagues = flag('leagues', 40);
const seasons = flag('seasons', 10);
const teamCount = flag('teams', 8);
const from = flag('from', 2);
const workers = flag('workers', 4);

interface Tally {
	aWins: number;
	meetings: number;
	aTitles: number;
	titles: number;
	ms: number;
	/** A's win share in each league, for the error bar (meetings within a league aren't independent). */
	shares: number[];
}

async function load(path: string): Promise<BotPolicy> {
	const file = path === 'default' ? '../src/server/games/mayhem-manager/bot.ts' : resolve(path);
	const url = path === 'default' ? new URL(file, import.meta.url).href : pathToFileURL(file).href;
	return ((await import(url)) as { BOT: BotPolicy }).BOT;
}

async function playLeague(a: BotPolicy, b: BotPolicy, tally: Tally): Promise<void> {
	const league = new MayhemManager();
	league.emitEventTo = () => {};
	for (let i = 0; i < teamCount; i++) league.handleAction(1, { type: 'addBot' }, true);
	const s = () => (league as unknown as { s: LeagueState }).s;
	const ids = s().teams.map((t) => t.id);
	const shuffled = ids.slice().sort(() => Math.random() - 0.5);
	const sideA = new Set(shuffled.slice(0, teamCount / 2));
	league.botFor = (id) => (sideA.has(id) ? a : b);
	const seen = new Set<number>();
	const before = { wins: tally.aWins, meetings: tally.meetings };
	const champions = new Set<number>();
	const started = Date.now();
	for (let step = 0; step < seasons * 30 && s().season <= seasons; step++) {
		league.handleAction(1, { type: 'forceReady' }, true);
		const st = s();
		for (const m of st.matches) {
			if (!m.result || seen.has(m.id) || m.season < from) continue;
			seen.add(m.id);
			if (sideA.has(m.a) === sideA.has(m.b)) continue;
			tally.meetings++;
			if (sideA.has(m.result.winner)) tally.aWins++;
		}
		for (const record of st.seasons) {
			if (record.season < from || champions.has(record.season) || record.champion === null) continue;
			champions.add(record.season);
			tally.titles++;
			if (sideA.has(record.champion)) tally.aTitles++;
		}
	}
	tally.ms += Date.now() - started;
	tally.shares.push((tally.aWins - before.wins) / Math.max(tally.meetings - before.meetings, 1));
}

async function runWorker(count: number): Promise<Tally> {
	const [a, b] = await Promise.all([load(pathA), load(pathB)]);
	const tally: Tally = { aWins: 0, meetings: 0, aTitles: 0, titles: 0, ms: 0, shares: [] };
	for (let i = 0; i < count; i++) await playLeague(a, b, tally);
	return tally;
}

if (process.env.MM_H2H_WORKER) {
	runWorker(Number(process.env.MM_H2H_WORKER)).then((t) => process.send!(t));
} else {
	const self = fileURLToPath(import.meta.url);
	const per = Array.from({ length: workers }, (_, i) => Math.floor(leagues / workers) + (i < leagues % workers ? 1 : 0));
	const results = await Promise.all(
		per.map(
			(count) =>
				new Promise<Tally>((done, fail) => {
					const child = fork(self, args, { env: { ...process.env, MM_H2H_WORKER: String(count) }, execArgv: ['--import', 'tsx'] });
					child.on('message', (t) => done(t as Tally));
					child.on('error', fail);
					child.on('exit', (code) => code && fail(new Error(`worker exited with ${code}`)));
				})
		)
	);
	const t = results.reduce((x, y) => ({
		aWins: x.aWins + y.aWins,
		meetings: x.meetings + y.meetings,
		aTitles: x.aTitles + y.aTitles,
		titles: x.titles + y.titles,
		ms: x.ms + y.ms,
		shares: [...x.shares, ...y.shares]
	}));
	const p = t.aWins / t.meetings;
	const mean = t.shares.reduce((a, b) => a + b, 0) / t.shares.length;
	const se = Math.sqrt(t.shares.reduce((a, b) => a + (b - mean) ** 2, 0) / (t.shares.length - 1) / t.shares.length);
	console.log(`${pathA} vs ${pathB}: A wins ${(100 * p).toFixed(1)}% ± ${(100 * se).toFixed(1)} of ${t.meetings} meetings, ${t.aTitles}/${t.titles} titles · ${(t.ms / leagues / 1000).toFixed(1)}s per league`);
}
