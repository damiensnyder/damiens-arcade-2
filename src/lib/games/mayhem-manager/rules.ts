// League rules and pure helpers shared by client and server.

import { ABILITIES, EQUIPMENT } from './catalog.js';
import { STAT_NAMES, type Equipment, type Fighter, type Match, type Phase, type Slot, type StandingRow, type TeamId } from './types.js';

export const MAX_TEAMS = 16;
export const STARTING_MONEY = 100;
/** Each offseason, teams keep half their money and get this much more. */
export const SEASON_INCOME = 100;
export const FA_DAYS = 3;
export const MAX_REGULAR_SEASON_WEEKS = 4;
export const FA_CONTRACT_YEARS = 2;
export const RESIGN_CONTRACT_YEARS = 3;
export const NEW_EQUIPMENT_YEARS = 2;
export const REPAIR_YEARS = 2;
export const MAX_STAT = 10;
/** How much more than a fighter's price they ask for on each day of free agency. */
export const FA_DAY_MARKUPS = [1.2, 1.1, 1];
/** How much more than their price fighters ask to re-sign (for a longer contract). */
export const RESIGN_MARKUP = 1.2;
const BASE_FIGHTER_PRICE = 20;
const PRICE_PER_STAT_POINT = 0.5;
const MIN_FIGHTER_PRICE = 30;
const MAX_FIGHTER_PRICE = 60;

/** Expected change in each stat over a year from age alone. Training camp adds on top of this. */
export function averageIncrease(age: number): number {
	return age < 32 ? (26 - age) * 0.1 : (32 - age) * 0.07 - 0.5;
}

/**
 * A fighter's stat points averaged over a contract: the first season as they are now, each later
 * one after another year of expected development (see averageIncrease). Young fighters are worth
 * a little more than their stats show, and old ones a little less.
 */
export function projectedStatPoints(f: Fighter, years: number): number {
	const stats = STAT_NAMES.map((stat) => f.stats[stat]);
	let total = 0;
	for (let year = 0; year < years; year++) {
		if (year > 0) {
			const change = averageIncrease(f.age + year);
			for (let i = 0; i < stats.length; i++) stats[i] = Math.min(Math.max(stats[i] + change, 0), MAX_STAT);
		}
		total += stats.reduce((sum, stat) => sum + stat, 0);
	}
	return total / years;
}

/**
 * What a fighter costs on the last day of free agency: $20, plus $0.50 per half-star (stat point)
 * averaged over the contract, plus whatever their ability is worth, kept between $30 and $60.
 */
export function fighterPrice(f: Fighter, years = FA_CONTRACT_YEARS): number {
	const price = BASE_FIGHTER_PRICE + PRICE_PER_STAT_POINT * projectedStatPoints(f, years) + (ABILITIES[f.ability]?.price ?? 0);
	return Math.round(Math.min(Math.max(price, MIN_FIGHTER_PRICE), MAX_FIGHTER_PRICE));
}

/** Asking prices on each day of free agency. */
export function freeAgentPrices(f: Fighter): number[] {
	const price = fighterPrice(f, FA_CONTRACT_YEARS);
	return FA_DAY_MARKUPS.map((markup) => Math.round(price * markup));
}

export function resignPrice(f: Fighter): number {
	return Math.round(fighterPrice(f, RESIGN_CONTRACT_YEARS) * RESIGN_MARKUP);
}

/** Stats are tracked in fractions but shown in whole points (half-stars), so nearly-10 counts as maxed. */
export function isMaxed(stat: number): boolean {
	return stat >= MAX_STAT - 0.5;
}

const SLOT_CAPACITY: Record<Slot, number> = { head: 1, hand: 2, torso: 1, legs: 1, feet: 1 };

/** Whether one fighter can wear all of these equipment keys at once. */
export function canWearTogether(keys: string[]): boolean {
	const used: Record<Slot, number> = { head: 0, hand: 0, torso: 0, legs: 0, feet: 0 };
	for (const key of keys) {
		const info = EQUIPMENT[key];
		if (!info) return false;
		for (const slot of info.slots) {
			used[slot]++;
			if (used[slot] > SLOT_CAPACITY[slot]) return false;
		}
	}
	return true;
}

/**
 * Drops anything invalid from a lineup: fighters or equipment the team doesn't have,
 * equipment given to two fighters, and loadouts that don't fit.
 */
export function sanitizeLineup(
	fighters: Fighter[],
	equipment: Equipment[],
	lineup: Record<number, number[]>
): Record<number, number[]> {
	const keyOf = new Map(equipment.map((e) => [e.id, e.key]));
	const used = new Set<number>();
	const result: Record<number, number[]> = {};
	for (const f of fighters) {
		const kept: number[] = [];
		for (const eqId of lineup[f.id] ?? []) {
			const key = keyOf.get(eqId);
			if (key === undefined || used.has(eqId)) continue;
			if (!canWearTogether([...kept.map((k) => keyOf.get(k)!), key])) continue;
			kept.push(eqId);
			used.add(eqId);
		}
		result[f.id] = kept;
	}
	return result;
}

export function regularSeasonWeeks(teamCount: number): number {
	return Math.max(1, Math.min(MAX_REGULAR_SEASON_WEEKS, teamCount - 1));
}

/** The smallest of 2, 4, 6 or 8 teams that lets at least half the league into the playoffs. */
export function playoffSize(teamCount: number): number {
	const size = [2, 4, 6, 8].find((n) => n >= teamCount / 2) ?? 8;
	return Math.min(size, Math.max(teamCount, 2));
}

/** Rounds in a playoff bracket. Brackets that aren't a power of two give the top seeds byes. */
export function playoffRoundCount(size: number): number {
	return Math.ceil(Math.log2(Math.max(size, 2)));
}

export function roundName(round: number, totalRounds: number): string {
	const fromEnd = totalRounds - 1 - round;
	if (fromEnd === 0) return 'final';
	if (fromEnd === 1) return 'semifinals';
	if (fromEnd === 2) return 'quarterfinals';
	return `round ${round + 1}`;
}

/** Regular-season standings, best first. Ties go to prevailed-for minus prevailed-against, then prevailed-for. */
export function computeStandings(matches: Match[], season: number, teams: TeamId[]): StandingRow[] {
	const rows = new Map<TeamId, StandingRow>(teams.map((t) => [t, { team: t, wins: 0, losses: 0, pf: 0, pa: 0 }]));
	for (const m of matches) {
		if (m.season !== season || m.week === null || !m.result) continue;
		const a = rows.get(m.a);
		const b = rows.get(m.b);
		if (a) {
			a.pf += m.result.standingA;
			a.pa += m.result.standingB;
			if (m.result.winner === m.a) a.wins++;
			else a.losses++;
		}
		if (b) {
			b.pf += m.result.standingB;
			b.pa += m.result.standingA;
			if (m.result.winner === m.b) b.wins++;
			else b.losses++;
		}
	}
	return [...rows.values()].sort(
		(x, y) => y.wins - x.wins || y.pf - y.pa - (x.pf - x.pa) || y.pf - x.pf || x.losses - y.losses || x.team - y.team
	);
}

/** Repairs start cheap and cost more each time an item has already been repaired. */
export function repairPrice(catalogPrice: number, timesRepaired: number): number {
	return Math.max(2, Math.round(catalogPrice * 0.25 * (timesRepaired + 1)));
}

export function phaseLabel(phase: Phase, teamCount: number, playoffRounds: number): string {
	switch (phase.kind) {
		case 'pregame':
			return 'waiting to start';
		case 'offseason':
			return 'offseason';
		case 'freeAgency':
			return `free agency, day ${phase.day} of ${FA_DAYS}`;
		case 'training':
			return 'training camp';
		case 'regularSeason':
			return `regular season, week ${phase.week + 1} of ${regularSeasonWeeks(teamCount)}`;
		case 'playoffs':
			return `playoffs, ${roundName(phase.round, playoffRounds)}`;
		case 'seasonOver':
			return 'season over';
	}
}

export function ordinal(n: number): string {
	const s = ['th', 'st', 'nd', 'rd'];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
