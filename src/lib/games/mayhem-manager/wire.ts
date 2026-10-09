// Compact encodings for the data that grows over a league's life. Rows of numbers are several
// times smaller than objects with repeated keys and names.

import type {
	Career,
	LeagueHistory,
	LeagueHistoryWire,
	PackedRows,
	SeasonRecord,
	StatLine,
	StatTotal,
	Totals
} from './types.js';

/** [fighterId, team, season, matchId, playoffs (0/1), prevailed, kos, kod, dmgDealt, dmgTaken] */
export function packStatLines(lines: StatLine[]): PackedRows {
	const names: Record<number, string> = {};
	const rows = lines.map((l) => {
		names[l.fighterId] = l.name;
		return [l.fighterId, l.team, l.season, l.matchId, l.playoffs ? 1 : 0, l.prevailed, l.kos, l.kod, l.dmgDealt, l.dmgTaken];
	});
	return { names, rows };
}

export function unpackStatLines(packed: PackedRows): StatLine[] {
	return packed.rows.map(([fighterId, team, season, matchId, playoffs, prevailed, kos, kod, dmgDealt, dmgTaken]) => ({
		fighterId,
		name: packed.names[fighterId] ?? '?',
		team,
		season,
		matchId,
		playoffs: playoffs === 1,
		fights: 1,
		prevailed,
		kos,
		kod,
		dmgDealt,
		dmgTaken
	}));
}

/** [fighterId, team, season, playoffs (0/1), fights, prevailed, kos, kod, dmgDealt, dmgTaken] */
export function packTotals(totals: StatTotal[]): PackedRows {
	const names: Record<number, string> = {};
	const rows = totals.map((t) => {
		names[t.fighterId] = t.name;
		return [t.fighterId, t.team, t.season, t.playoffs ? 1 : 0, t.fights, t.prevailed, t.kos, t.kod, t.dmgDealt, t.dmgTaken];
	});
	return { names, rows };
}

export function unpackTotals(packed: PackedRows): StatTotal[] {
	return packed.rows.map(([fighterId, team, season, playoffs, fights, prevailed, kos, kod, dmgDealt, dmgTaken]) => ({
		fighterId,
		name: packed.names[fighterId] ?? '?',
		team,
		season,
		playoffs: playoffs === 1,
		fights,
		prevailed,
		kos,
		kod,
		dmgDealt,
		dmgTaken
	}));
}

const totalsToRow = (t: Totals) => [t.fights, t.prevailed, t.kos, t.kod, t.dmgDealt, t.dmgTaken];
const rowToTotals = (r: number[]): Totals => ({ fights: r[0], prevailed: r[1], kos: r[2], kod: r[3], dmgDealt: r[4], dmgTaken: r[5] });

export function packHistory(history: LeagueHistory): LeagueHistoryWire {
	const names: Record<number, string> = {};
	// [fighterId, team, seasons, ...regular-season totals (6), ...playoff totals (6)]
	const rows = history.careers.map((c) => {
		names[c.fighterId] = c.name;
		return [c.fighterId, c.team, c.seasons, ...totalsToRow(c.regularSeason), ...totalsToRow(c.playoffs)];
	});
	return {
		version: history.version,
		seasons: history.seasons.map((s) => ({
			season: s.season,
			standings: s.standings.map((r) => [r.team, r.wins, r.losses, r.pf, r.pa]),
			bracket: s.bracket,
			champion: s.champion
		})),
		careers: { names, rows }
	};
}

export function unpackHistory(wire: LeagueHistoryWire): LeagueHistory {
	const seasons: SeasonRecord[] = wire.seasons.map((s) => ({
		season: s.season,
		standings: s.standings.map(([team, wins, losses, pf, pa]) => ({ team, wins, losses, pf, pa })),
		bracket: s.bracket,
		champion: s.champion
	}));
	const careers: Career[] = wire.careers.rows.map((r) => ({
		fighterId: r[0],
		name: wire.careers.names[r[0]] ?? '?',
		team: r[1],
		seasons: r[2],
		regularSeason: rowToTotals(r.slice(3, 9)),
		playoffs: rowToTotals(r.slice(9, 15))
	}));
	return { version: wire.version, seasons, careers };
}
