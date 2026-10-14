// Plain-English summaries of how teams did.

import { ordinal, roundName } from './rules.js';
import { TEAMS } from './teams.js';
import type { FreeAgent, SeasonRecord, TeamId } from './types.js';

/** Where a free agent comes from: "rookie", "formerly of the Pandas" or "free agent". */
export function freeAgentOrigin(agent: FreeAgent): string {
	if (agent.rookie) return 'rookie';
	if (agent.formerTeam !== null) return `formerly of the ${TEAMS[agent.formerTeam].last}`;
	return 'free agent';
}

/** How far a team got in a season's playoffs, e.g. "lost semifinal to Pandas". */
export function playoffResult(record: SeasonRecord, team: TeamId, short = true): string {
	const rounds = record.bracket.rounds;
	if (record.champion === team) {
		const final = rounds.at(-1)?.[0];
		const opponent = final ? (final.a.team === team ? final.b.team : final.a.team) : null;
		return opponent !== null && opponent !== undefined
			? `won the title${short ? '' : `, beating the ${TEAMS[opponent].name} in the final`}`
			: 'won the title';
	}
	for (let r = rounds.length - 1; r >= 0; r--) {
		for (const p of rounds[r]) {
			if (p.a.team !== team && p.b.team !== team) continue;
			const opponent = p.a.team === team ? p.b.team : p.a.team;
			if (p.winner === null || opponent === null) return 'in progress';
			const name = roundName(r, rounds.length);
			const stage = name === 'final' ? 'the final' : name === 'semifinals' ? 'the semifinal' : `the ${name}`;
			return `lost ${stage} to ${short ? TEAMS[opponent].last : 'the ' + TEAMS[opponent].name}`;
		}
	}
	return 'missed the playoffs';
}

export function seasonRecap(record: SeasonRecord, team: TeamId): string {
	const index = record.standings.findIndex((r) => r.team === team);
	if (index < 0) return '';
	const row = record.standings[index];
	const result = playoffResult(record, team, false);
	return `${row.wins}–${row.losses} in the regular season (${ordinal(index + 1)} of ${record.standings.length}). ${result[0].toUpperCase()}${result.slice(1)}.`;
}

export function yearsLeft(n: number): string {
	return `${n} yr${n === 1 ? '' : 's'} left`;
}
