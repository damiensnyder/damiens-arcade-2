// Plays an all-bot Mayhem Manager league headlessly and prints how teams fared, for balance
// tuning, plus how big the data sent to clients gets as the league ages.
// Usage: npx tsx scripts/mm-simulate.ts [teams=8] [seasons=5]

import MayhemManager from '../src/server/games/mayhem-manager/index.js';
import type { LeagueHistory, MMPrivateEvent, MMViewpointWire } from '../src/lib/games/mayhem-manager/types.js';
import { unpackHistory } from '../src/lib/games/mayhem-manager/wire.js';
import { TEAMS } from '../src/lib/games/mayhem-manager/teams.js';

const teamCount = Number(process.argv[2] ?? 8);
const seasons = Number(process.argv[3] ?? 5);
const HOST = 1;

const league = new MayhemManager();
let lastEvent: MMPrivateEvent | null = null;
league.emitEventTo = (_viewer, event) => (lastEvent = event as MMPrivateEvent);
for (let i = 0; i < teamCount; i++) league.handleAction(HOST, { type: 'addBot' }, true);
const view = () => league.viewpointOf(HOST) as MMViewpointWire;
const kb = (x: unknown) => (JSON.stringify(x).length / 1024).toFixed(1) + ' KB';

function fetchHistory(): { history: LeagueHistory; size: string } {
	league.handleAction(HOST, { type: 'getHistory' }, true);
	const e = lastEvent as MMPrivateEvent | null;
	if (e?.type !== 'history') throw new Error('no history sent');
	return { history: unpackHistory(e.history), size: kb(e.history) };
}

// with nobody in the league, each force-ready moves things along one step
let reported = 1;
let rosters = '';
for (let step = 0; step < seasons * 25 && view().season <= seasons; step++) {
	league.handleAction(HOST, { type: 'forceReady' }, true);
	const vp = view();
	// report sizes during the regular season, when the live state is near its largest
	if (vp.phase.kind === 'playoffs' && vp.season >= reported && (vp.season % 10 === 0 || vp.season === 1 || vp.season === seasons)) {
		league.handleAction(HOST, { type: 'getSeasonStats', season: Math.max(1, vp.season - 1) }, true);
		const totals = lastEvent as MMPrivateEvent | null;
		console.log(
			`season ${vp.season}: live state ${kb(vp)} · history ${fetchHistory().size} · one season's totals ${totals?.type === 'seasonStats' ? kb(totals.totals) : '-'}`
		);
		reported = vp.season + 1;
	}
	if (vp.phase.kind === 'playoffs' && vp.season === seasons && !rosters) {
		// rosters mid-season, when contracts and signings have settled
		rosters = vp.teams
			.map((t) => `  ${TEAMS[t.id].abbr}  $${t.money}  ${t.fighters.filter((f) => !f.isOwner).length} fighters  ${t.equipment.length} equipment  ${t.titles} titles`)
			.join('\n');
	}
}

const { history } = fetchHistory();
for (const record of history.seasons.slice(-5)) {
	console.log(`season ${record.season}: champion ${record.champion === null ? '?' : TEAMS[record.champion].name}`);
	console.log('  ' + record.standings.map((r) => `${TEAMS[r.team].abbr} ${r.wins}-${r.losses}`).join('  '));
}
console.log(`\nteams during season ${seasons}'s playoffs:\n${rosters}`);
const fights = history.careers.reduce((s, c) => s + c.regularSeason.fights + c.playoffs.fights, 0);
const kos = history.careers.reduce((s, c) => s + c.regularSeason.kos + c.playoffs.kos, 0);
console.log(`\n${history.careers.length} fighters have played, ${(kos / Math.max(fights, 1)).toFixed(2)} KOs per fighter per fight`);
league.handleAction(HOST, { type: 'exportLeague' }, true);
const exported = lastEvent as MMPrivateEvent | null;
if (exported?.type === 'leagueExport') console.log(`league file: ${kb(exported.league)}`);
