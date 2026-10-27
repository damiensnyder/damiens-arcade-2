// The whole league as plain data, so it can be exported, validated and imported.

import { z } from 'zod';
import { ABILITY_KEYS, EQUIPMENT_KEYS } from '../../../lib/games/mayhem-manager/catalog.js';
import { MAX_TEAMS } from '../../../lib/games/mayhem-manager/rules.js';
import type {
	Bracket,
	Equipment,
	ExpiringContract,
	Fighter,
	ItemStatLine,
	FreeAgent,
	Match,
	Phase,
	RepairItem,
	SeasonRecord,
	ShopItem,
	StatLine,
	StatTotal,
	TeamId,
	TrainingPlan
} from '../../../lib/games/mayhem-manager/types.js';
import type { RngState } from './rng.js';
import { unpackTotals } from '../../../lib/games/mayhem-manager/wire.js';
import type { PackedRows } from '../../../lib/games/mayhem-manager/types.js';

export interface TeamState {
	id: TeamId;
	/** Viewer ID of the person running the team, or 'bot'. */
	controller: number | 'bot';
	money: number;
	ready: boolean;
	fighters: Fighter[];
	equipment: Equipment[];
	titles: number;
	/** The season the team joined the league (for new-franchise money; taking over a bot's team doesn't count). */
	firstSeason: number;
	expiring: ExpiringContract[];
	repairs: RepairItem[];
	shop: ShopItem[];
	training: Record<number, TrainingPlan | null>;
	/** Fighter ID → equipment IDs, carried over from week to week. */
	lineup: Record<number, number[]>;
}

export interface LeagueState {
	version: 2;
	/** When the league was created (ms since epoch). Identifies its save in the browser. */
	createdAt: number;
	season: number;
	phase: Phase;
	teams: TeamState[];
	/** During free agency, the fighters on offer; otherwise, those who might be (see FreeAgent). */
	freeAgents: FreeAgent[];
	/** This season's matches. Earlier seasons survive as `seasons` records. */
	matches: Match[];
	bracket: Bracket | null;
	seasons: SeasonRecord[];
	/** This season's box scores, one line per fighter per match (needed to hide unseen results). */
	statLines: StatLine[];
	/** This season's equipment totals, one line per item per match. Rolled into the items at season end. */
	itemLines: ItemStatLine[];
	/** Earlier seasons' box scores, rolled up to one line per fighter, team and season half. */
	seasonStats: StatTotal[];
	nextId: number;
	rng: RngState;
}

// ---- import validation ----

const int = z.number().int();
const nonneg = int.nonnegative();
const teamId = int.min(0).max(MAX_TEAMS - 1);
const statValue = z.number().min(-50).max(50);
const stats = z.object({
	strength: statValue,
	accuracy: statValue,
	energy: statValue,
	speed: statValue,
	toughness: statValue
});
const equipmentKey = z.string().refine((k) => EQUIPMENT_KEYS.includes(k), 'unknown equipment');

const fighter = z.object({
	id: nonneg,
	name: z.string().max(100),
	age: int.min(0).max(150),
	stats,
	prevStats: stats.optional(),
	look: z.object({
		gender: z.enum(['M', 'F', 'A']),
		hair: int.min(1).max(4),
		face: int.min(1).max(2),
		shirt: int.min(1).max(2),
		skin: int.min(0).max(9),
		hairColor: int.min(0).max(9)
	}),
	// Inattentive used to be Sleepyhead
	ability: z.preprocess((k) => (k === 'sleepyhead' ? 'inattentive' : k), z.string().refine((k) => ABILITY_KEYS.includes(k), 'unknown ability')),
	attunements: z.array(equipmentKey),
	contractYears: int,
	isOwner: z.boolean().optional()
});

const itemNumbers = {
	dmgDealt: z.number().nonnegative(),
	hpHealed: z.number().nonnegative(),
	dmgPrevented: z.number().nonnegative(),
	moneyEarned: z.number().nonnegative()
};
const equipment = z.object({
	id: nonneg,
	key: equipmentKey,
	yearsLeft: int,
	yearsOwned: nonneg,
	timesRepaired: nonneg.default(0),
	totals: z.object(itemNumbers).optional(),
	growth: nonneg.optional()
});
const decision = z.enum(['pending', 'keep', 'drop']);
const plan = z.union([
	z.object({ kind: z.literal('stat'), stat: z.enum(['strength', 'accuracy', 'energy', 'speed', 'toughness']) }),
	z.object({ kind: z.literal('attune'), key: equipmentKey })
]);
const idRecord = <T extends z.ZodTypeAny>(value: T) =>
	z.record(z.string().regex(/^\d+$/), value).transform((r) => r as Record<number, z.infer<T>>);

const team = z.object({
	id: teamId,
	controller: z.union([z.literal('bot'), int]),
	money: z.number().min(-1e6).max(1e6),
	ready: z.boolean(),
	fighters: z.array(fighter).max(50),
	equipment: z.array(equipment).max(100),
	titles: nonneg,
	// leagues saved before this was tracked: an established team
	firstSeason: int.min(1).default(1),
	expiring: z.array(z.object({ fighter, ask: z.number(), decision })),
	repairs: z.array(z.object({ equipment, price: z.number(), decision })),
	shop: z.array(z.object({ id: nonneg, key: equipmentKey, price: z.number(), bought: z.boolean() })),
	training: idRecord(plan.nullable()),
	lineup: idRecord(z.array(nonneg))
});

const phase = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('pregame') }),
	z.object({ kind: z.literal('offseason') }),
	z.object({ kind: z.literal('freeAgency'), day: int.min(1).max(10) }),
	z.object({ kind: z.literal('training') }),
	z.object({ kind: z.literal('regularSeason'), week: nonneg }),
	z.object({ kind: z.literal('playoffs'), round: nonneg }),
	z.object({ kind: z.literal('seasonOver') })
]);

const match = z.object({
	id: nonneg,
	season: int.min(1),
	week: nonneg.nullable(),
	round: nonneg.nullable(),
	a: teamId,
	b: teamId,
	result: z.object({ winner: teamId, standingA: nonneg, standingB: nonneg }).nullable()
});

const slot = z.object({ team: teamId.nullable(), seed: int.nullable() });
const bracket = z.object({
	rounds: z.array(
		z.array(z.object({ a: slot, b: slot, matchId: nonneg.nullable(), winner: teamId.nullable(), bye: z.boolean().optional() }))
	)
});

const standingRow = z.object({ team: teamId, wins: nonneg, losses: nonneg, pf: nonneg, pa: nonneg });

const statNumbers = {
	fighterId: nonneg,
	name: z.string().max(100),
	team: teamId,
	season: int.min(1),
	playoffs: z.boolean(),
	fights: nonneg,
	prevailed: nonneg,
	kos: nonneg,
	kod: nonneg,
	dmgDealt: z.number().nonnegative(),
	dmgTaken: z.number().nonnegative()
};

export const leagueSchema = z.object({
	version: z.literal(2),
	// leagues saved before saves were keyed by creation time get one on import
	createdAt: int.nonnegative().default(() => Date.now()),
	season: int.min(1),
	phase,
	teams: z.array(team).max(MAX_TEAMS),
	freeAgents: z.array(
		z.object({
			fighter,
			prices: z.array(z.number()),
			formerTeam: teamId.nullable(),
			rookie: z.boolean().default(false),
			signedBy: teamId.nullable(),
			signedPrice: z.number().nullable()
		})
	),
	matches: z.array(match),
	bracket: bracket.nullable(),
	seasons: z.array(
		z.object({ season: int.min(1), standings: z.array(standingRow), bracket, champion: teamId.nullable() })
	),
	statLines: z.array(z.object({ ...statNumbers, matchId: nonneg })),
	// leagues saved before equipment had stats
	itemLines: z.array(z.object({ ...itemNumbers, equipmentId: nonneg, matchId: nonneg })).default([]),
	// league files store these packed (see wire.ts), since they grow every season
	seasonStats: z.union([
		z.array(z.object(statNumbers)),
		z
			.object({ names: z.record(z.string().regex(/^\d+$/), z.string().max(100)), rows: z.array(z.array(z.number()).length(10)) })
			.transform((packed) => unpackTotals(packed as PackedRows))
	]),
	nextId: nonneg,
	rng: z.tuple([int, int, int, int])
});

/** Checks the invariants zod can't express. Returns an error message, or null if the league is usable. */
export function checkLeague(league: LeagueState): string | null {
	const teamIds = new Set<number>();
	for (const t of league.teams) {
		if (teamIds.has(t.id)) return `team ${t.id} appears twice`;
		teamIds.add(t.id);
	}
	const ids = [
		...league.teams.flatMap((t) => [
			...t.fighters.map((f) => f.id),
			...t.equipment.map((e) => e.id),
			...t.expiring.map((c) => c.fighter.id),
			...t.repairs.map((r) => r.equipment.id)
		]),
		...league.freeAgents.map((a) => a.fighter.id)
	];
	if (new Set(ids).size !== ids.length) return 'two fighters or items share an ID';
	if (ids.some((id) => id >= league.nextId)) return 'nextId is too small';
	for (const m of league.matches) {
		if (!teamIds.has(m.a) || !teamIds.has(m.b)) {
			// matches from past seasons may involve teams that have since left
			if (m.season === league.season) return `match ${m.id} involves a team that isn't in the league`;
		}
	}
	const inSeason = league.phase.kind === 'regularSeason' || league.phase.kind === 'playoffs';
	if (inSeason && league.teams.length < 2) return 'a season needs at least two teams';
	if (league.phase.kind === 'playoffs' && !league.bracket) return 'playoffs need a bracket';
	return null;
}
